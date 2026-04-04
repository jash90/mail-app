import type { EmailThread, CursorPagination } from '@/types';
import type { GmailThread } from '../types';
import { GMAIL_API } from '@/config/constants';
import { apiRequestRaw, gmailRequest } from '../api';
import { parseMultipartResponseWithStatus } from '../helpers';
import {
  upsertThreads,
  countExistingThreads,
  filterNewProviderThreadIds,
  filterStaleProviderThreadIds,
  deleteThread as deleteThreadDb,
} from '@/db/repositories/threads';
import { mapGmailThreadToEmailThread } from './transform';

const THREAD_METADATA_PARAMS =
  'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=List-Id&metadataHeaders=List-Unsubscribe&metadataHeaders=Auto-Submitted';

/**
 * Fetch multiple threads in a single batch HTTP request.
 * Gmail Batch API supports up to 100 requests per batch.
 */
export const batchGetThreads = async (
  accountId: string,
  threadIds: string[],
): Promise<EmailThread[]> => {
  if (threadIds.length === 0) return [];

  // Skip threads updated within last 24h
  const staleIds = filterStaleProviderThreadIds(accountId, threadIds);
  if (staleIds.length === 0) {
    return [];
  }

  const boundary = `batch_${Date.now()}`;

  const body =
    staleIds
      .map(
        (id) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${id}>\r\n\r\n` +
          `GET /gmail/v1/users/me/threads/${id}?${THREAD_METADATA_PARAMS} HTTP/1.1\r\n\r\n`,
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

  const allParts = parseMultipartResponseWithStatus(
    responseText,
    responseBoundary,
  );

  const successThreads: GmailThread[] = [];
  for (const part of allParts) {
    if (part.status >= 200 && part.status < 300 && part.body) {
      successThreads.push(part.body as GmailThread);
    } else if (part.contentId) {
      console.warn(
        `[Gmail] Failed to fetch thread ${part.contentId}: HTTP ${part.status} — removing from local DB`,
        part.body,
      );
      try {
        deleteThreadDb(`${accountId}_${part.contentId}`);
      } catch (e) {
        console.error('[batchGetThreads] Failed to delete thread:', e);
      }
    }
  }

  const mapped = successThreads
    .map((thread) => mapGmailThreadToEmailThread(accountId, thread))
    .filter((t): t is EmailThread => t !== null);

  // Persist to SQLite
  try {
    upsertThreads(mapped);
  } catch (e) {
    console.error('[batchGetThreads] DB upsert failed:', e);
  }

  return mapped;
};

export const listThreads = async (
  accountId: string,
  labelIds: string[] = ['INBOX'],
  pagination?: CursorPagination,
): Promise<{ threads: EmailThread[]; nextPageToken?: string }> => {
  const params = new URLSearchParams({
    maxResults: String(pagination?.limit || 50),
    ...(pagination?.cursor && { pageToken: pagination.cursor }),
  });
  for (const id of labelIds) {
    params.append('labelIds', id);
  }

  const response = await gmailRequest<{
    threads?: Array<{ id: string; snippet: string; historyId: string }>;
    nextPageToken?: string;
  }>(`/threads?${params}`);

  if (!response.threads) {
    return { threads: [], nextPageToken: undefined };
  }

  const allThreadIds = response.threads.map((t) => t.id);

  // Fast path: single COUNT(*) — if all threads exist locally, skip batch entirely
  if (countExistingThreads(accountId, allThreadIds) === allThreadIds.length) {
    return { threads: [], nextPageToken: response.nextPageToken };
  }

  const newThreadIds = filterNewProviderThreadIds(accountId, allThreadIds);
  const threads = await batchGetThreads(accountId, newThreadIds);

  return {
    threads,
    nextPageToken: response.nextPageToken,
  };
};

export const getThread = async (
  accountId: string,
  threadId: string,
): Promise<EmailThread | null> => {
  try {
    const thread = await gmailRequest<GmailThread>(
      `/threads/${threadId}?${THREAD_METADATA_PARAMS}`,
    );
    const mapped = mapGmailThreadToEmailThread(accountId, thread);
    if (mapped) {
      try {
        upsertThreads([mapped]);
      } catch (e) {
        console.error('[getThread] DB upsert failed:', e);
      }
    }
    return mapped;
  } catch (error) {
    console.error(`Failed to get thread ${threadId}`, { error });
    return null;
  }
};
