import { GMAIL_API } from '@/src/shared/config/constants';
import { upsertStatMessages } from '@/src/shared/db/repositories/messages';
import { upsertThreads } from '@/src/shared/db/repositories/threads';
import type { EmailThread } from '@/src/shared/types';
import type { GmailThread, GmailMessage } from '@/src/features/gmail/types';
import type { BatchPartResult } from '@/src/features/gmail/helpers/batch';
import type { StatMessage, StatsProgress } from '../types';
import { delay } from '@/src/shared/services/rateLimiter';

/** Injected Gmail API dependencies — avoids cross-feature import from stats → gmail. */
export interface StatsGmailDeps {
  apiRequestRaw: (url: string, init: RequestInit) => Promise<Response>;
  parseMultipartResponseWithStatus: (
    body: string,
    boundary: string,
  ) => BatchPartResult[];
  mapGmailThreadToEmailThread: (
    accountId: string,
    thread: GmailThread,
  ) => EmailThread | null;
  extractStatMessage: (message: GmailMessage) => StatMessage;
  gmailRequest: <T>(path: string) => Promise<T>;
}

const GMAIL_ID_RE = /^[a-f0-9]+$/;

export const BATCH_SIZE = 25;

/**
 * Fetch a batch of thread IDs and return successful threads + IDs that need retry.
 */
export async function fetchBatch(
  accountId: string,
  batchIds: string[],
  batchIndex: number,
  deps: StatsGmailDeps,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<{
  threads: EmailThread[];
  retryIds: string[];
  skippedCount: number;
}> {
  const validIds = batchIds.filter((id) => {
    if (GMAIL_ID_RE.test(id)) return true;
    console.warn(`[Batch] Skipping invalid thread ID: ${id}`);
    return false;
  });
  const invalidCount = batchIds.length - validIds.length;
  if (validIds.length === 0) {
    return { threads: [], retryIds: [], skippedCount: invalidCount };
  }

  const boundary = `batch_stats_${Date.now()}_${batchIndex}`;

  const body =
    validIds
      .map(
        (id) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${id}>\r\n\r\n` +
          `GET /gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=List-Id&metadataHeaders=List-Unsubscribe&metadataHeaders=Auto-Submitted HTTP/1.1\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;

  const response = await deps.apiRequestRaw(GMAIL_API.batchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  const responseText = await response.text();
  const responseBoundary =
    response.headers.get('content-type')?.match(/boundary=(.+)/)?.[1] ??
    boundary;

  const parts = deps.parseMultipartResponseWithStatus(
    responseText,
    responseBoundary,
  );

  const batchThreads: EmailThread[] = [];
  const batchMessages: StatMessage[][] = [];
  const retryIds: string[] = [];
  let skippedCount = 0;

  for (const part of parts) {
    // Rate-limited, quota exceeded, or server error → retry
    if (part.status === 429 || part.status === 403 || part.status >= 500) {
      console.warn(
        `[Batch] Part ${part.contentId ?? '?'} got ${part.status} — queuing for retry`,
      );
      if (part.contentId) {
        retryIds.push(part.contentId);
      }
      continue;
    }

    // Gone/not found → skip permanently
    if (part.status === 404 || part.status === 410) {
      skippedCount++;
      continue;
    }

    // Non-success and non-retryable → skip
    if (part.status !== 0 && (part.status < 200 || part.status >= 300)) {
      skippedCount++;
      continue;
    }

    // Success — try to map
    if (!part.body) {
      skippedCount++;
      continue;
    }

    const threadData = part.body as GmailThread;
    const mapped = deps.mapGmailThreadToEmailThread(accountId, threadData);
    if (!mapped) {
      skippedCount++;
      continue;
    }

    // Keep threads and messages in sync — both arrays get an entry only for successful maps
    batchThreads.push(mapped);
    batchMessages.push(
      threadData.messages
        ? threadData.messages.map((m) => deps.extractStatMessage(m))
        : [],
    );
  }

  // Persist to SQLite
  if (batchThreads.length > 0) {
    try {
      upsertThreads(batchThreads);
      for (let i = 0; i < batchThreads.length; i++) {
        if (batchMessages[i]?.length) {
          upsertStatMessages(
            accountId,
            batchThreads[i]!.id,
            batchThreads[i]!.provider_thread_id,
            batchMessages[i]!,
          );
        }
      }
      onBatch?.(batchThreads, batchMessages);
    } catch (err) {
      console.warn('[Stats] upsert failed:', err);
    }
  }

  return {
    threads: batchThreads,
    retryIds,
    skippedCount: skippedCount + invalidCount,
  };
}

/** Process a queue of thread IDs in BATCH_SIZE chunks. Returns IDs that failed and need retry. */
export async function processBatchQueue(
  accountId: string,
  ids: string[],
  phase: StatsProgress['phase'],
  allThreads: EmailThread[],
  delayMs: number,
  deps: StatsGmailDeps,
  onProgress?: (progress: StatsProgress) => void,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<{ retryIds: string[]; skippedCount: number }> {
  const retryIds: string[] = [];
  let skippedCount = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);

    if (i > 0) await delay(delayMs);

    try {
      const result = await fetchBatch(accountId, batchIds, i, deps, onBatch);
      allThreads.push(...result.threads);
      retryIds.push(...result.retryIds);
      skippedCount += result.skippedCount;
    } catch (err) {
      console.warn(
        `Batch ${i / BATCH_SIZE + 1} failed (${phase}), queuing ${batchIds.length} for retry`,
        err,
      );
      retryIds.push(...batchIds);
    }

    onProgress?.({
      phase,
      loaded: Math.min(i + batchIds.length, ids.length),
      total: ids.length,
    });
  }

  return { retryIds, skippedCount };
}
