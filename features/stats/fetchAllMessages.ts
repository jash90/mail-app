import { GMAIL_API } from '@/config/constants';
import { upsertStatMessages } from '@/db/repositories/messages';
import {
  filterStaleProviderThreadIds,
  purgeThreadsNotInList,
  upsertThreads,
} from '@/db/repositories/threads';
import { apiRequestRaw, gmailRequest } from '@/features/gmail/api';
import {
  getHeader,
  parseEmailAddress,
  parseEmailAddressList,
} from '@/features/gmail/helpers';
import { parseMultipartResponseWithStatus } from '@/features/gmail/helpers/batch';
import { mapGmailThreadToEmailThread } from '@/features/gmail/threads';
import type { GmailMessage, GmailThread } from '@/features/gmail/types';
import type { EmailThread } from '@/types';
import { delay } from '@/lib/rateLimiter';
import type { StatMessage, StatsProgress } from './types';

const BATCH_SIZE = 25;
const MAX_RETRY_ROUNDS = 5;
const GMAIL_ID_RE = /^[0-9a-f]+$/i;

async function listAllThreadIds(
  labelIds: string[] = ['INBOX', 'SENT'],
  onProgress?: (progress: StatsProgress) => void,
): Promise<string[]> {
  const idSet = new Set<string>();

  for (const label of labelIds) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        maxResults: '500',
        labelIds: label,
        ...(pageToken && { pageToken }),
      });

      const response = await gmailRequest<{
        threads?: Array<{ id: string }>;
        nextPageToken?: string;
      }>(`/threads?${params}`);

      if (response.threads) {
        for (const t of response.threads) idSet.add(t.id);
      }

      pageToken = response.nextPageToken;
      onProgress?.({ phase: 'listing', loaded: idSet.size, total: 0 });
    } while (pageToken);
  }

  return [...idSet];
}

/** Extract only the fields needed for stats from a Gmail message — no body, no attachments */
function extractStatMessage(msg: GmailMessage): StatMessage {
  const headers = msg.payload.headers;
  const fromRaw = getHeader(headers, 'From') || '';
  const from = parseEmailAddress(fromRaw).email.toLowerCase();

  const extractEmails = (header: string): string[] =>
    parseEmailAddressList(getHeader(headers, header) || '').map((p) =>
      p.email.toLowerCase(),
    );

  return {
    id: msg.id,
    from,
    to: extractEmails('To'),
    cc: extractEmails('Cc'),
    bcc: extractEmails('Bcc'),
    date: parseInt(msg.internalDate, 10),
  };
}

export interface FetchAllMessagesResult {
  threads: EmailThread[];
  failedCount: number;
  skippedCount: number;
  /** Total thread IDs returned by the API listing (before cache filtering) — represents how many threads exist in INBOX */
  totalListedCount: number;
  /** How many threads were skipped because they were fresh in the local DB cache */
  cachedCount: number;
  /** How many threads were purged from DB because they're no longer in INBOX */
  purgedCount: number;
}

/**
 * Fetch a batch of thread IDs and return successful threads + IDs that need retry.
 */
async function fetchBatch(
  accountId: string,
  batchIds: string[],
  batchIndex: number,
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
          `GET /gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References HTTP/1.1\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;

  const response = await apiRequestRaw(GMAIL_API.batchUrl, {
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

  const parts = parseMultipartResponseWithStatus(
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
    const mapped = mapGmailThreadToEmailThread(accountId, threadData);
    if (!mapped) {
      skippedCount++;
      continue;
    }

    // Keep threads and messages in sync — both arrays get an entry only for successful maps
    batchThreads.push(mapped);
    batchMessages.push(
      threadData.messages ? threadData.messages.map(extractStatMessage) : [],
    );
  }

  // Persist to SQLite
  if (batchThreads.length > 0) {
    try {
      upsertThreads(batchThreads);
      for (let i = 0; i < batchThreads.length; i++) {
        if (batchMessages[i].length > 0) {
          upsertStatMessages(
            accountId,
            batchThreads[i].id,
            batchThreads[i].provider_thread_id,
            batchMessages[i],
          );
        }
      }
      onBatch?.(batchThreads, batchMessages);
    } catch (err) {
      console.warn('[Stats] upsert failed:', err);
    }
  }

  return { threads: batchThreads, retryIds, skippedCount: skippedCount + invalidCount };
}

/** Process a queue of thread IDs in BATCH_SIZE chunks. Returns IDs that failed and need retry. */
async function processBatchQueue(
  accountId: string,
  ids: string[],
  phase: StatsProgress['phase'],
  allThreads: EmailThread[],
  delayMs: number,
  onProgress?: (progress: StatsProgress) => void,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<{ retryIds: string[]; skippedCount: number }> {
  const retryIds: string[] = [];
  let skippedCount = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);

    if (i > 0) await delay(delayMs);

    try {
      const result = await fetchBatch(accountId, batchIds, i, onBatch);
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

export async function fetchAllMessages(
  accountId: string,
  onProgress?: (progress: StatsProgress) => void,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<FetchAllMessagesResult> {
  const allThreadIds = await listAllThreadIds(['INBOX', 'SENT'], onProgress);
  const totalListedCount = allThreadIds.length;
  console.log(`[Stats] totalListedCount = ${totalListedCount}`);

  // Remove threads from DB that are no longer in INBOX
  const purgedCount = purgeThreadsNotInList(accountId, allThreadIds);

  // Filter out threads that are fresh in the local DB (updated < 24h ago)
  const staleIds = filterStaleProviderThreadIds(accountId, allThreadIds);
  const cachedCount = totalListedCount - staleIds.length;
  console.log(
    `[Stats] cachedCount = ${cachedCount}, staleIds = ${staleIds.length}`,
  );

  const allThreads: EmailThread[] = [];
  let { retryIds: retryQueue, skippedCount: totalSkipped } =
    await processBatchQueue(
      accountId,
      staleIds,
      'loading',
      allThreads,
      1000,
      onProgress,
      onBatch,
    );

  // Retry rounds with exponential backoff
  for (
    let round = 0;
    round < MAX_RETRY_ROUNDS && retryQueue.length > 0;
    round++
  ) {
    const backoffMs = 4000 * 2 ** round;
    console.log(
      `[Stats] Retry round ${round + 1}/${MAX_RETRY_ROUNDS}: ${retryQueue.length} IDs, backoff ${backoffMs}ms`,
    );
    await delay(backoffMs);

    const result = await processBatchQueue(
      accountId,
      retryQueue,
      'retrying',
      allThreads,
      1000,
      onProgress,
      onBatch,
    );
    retryQueue = result.retryIds;
    totalSkipped += result.skippedCount;
  }

  const failedCount = retryQueue.length;
  console.log(
    `[Stats] DONE: totalListed=${totalListedCount} cached=${cachedCount} purged=${purgedCount} loaded=${allThreads.length} failed=${failedCount} skipped=${totalSkipped}`,
  );
  if (failedCount > 0) {
    console.warn(`${failedCount} threads failed after all retry rounds`);
  }
  if (totalSkipped > 0) {
    console.warn(`${totalSkipped} threads skipped (404/410/malformed)`);
  }

  return {
    threads: allThreads,
    failedCount,
    skippedCount: totalSkipped,
    totalListedCount,
    cachedCount,
    purgedCount,
  };
}
