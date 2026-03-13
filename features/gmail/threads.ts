import type { EmailThread, CursorPagination } from '@/types';
import type { GmailThread } from './types';
import { GMAIL_API } from '@/config/constants';
import { apiRequestRaw, gmailRequest } from './api';
import { extractParticipants, cleanHeaderText, cleanSnippet, parseMultipartResponseWithStatus } from './helpers';
import { upsertThreads, countExistingThreads, filterNewProviderThreadIds, filterStaleProviderThreadIds, deleteThread as deleteThreadDb } from '@/db/repositories/threads';

const THREAD_METADATA_PARAMS = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date';

/**
 * Maps a raw Gmail thread to our normalized EmailThread type.
 */
export const mapGmailThreadToEmailThread = (
  accountId: string,
  thread: GmailThread,
): EmailThread | null => {
  if (!thread.messages || thread.messages.length === 0) {
    return null;
  }

  const firstMessage = thread.messages[0];
  const lastMessage = thread.messages[thread.messages.length - 1];
  const participants = extractParticipants(thread.messages);
  const subject = cleanHeaderText(firstMessage.payload.headers, 'Subject', '(No Subject)');

  const isRead = !thread.messages.some((m) => m.labelIds?.includes('UNREAD'));
  const isStarred = thread.messages.some((m) => m.labelIds?.includes('STARRED'));
  const isArchived = !thread.messages.some((m) => m.labelIds?.includes('INBOX'));
  const isTrashed = thread.messages.some((m) => m.labelIds?.includes('TRASH'));
  const labelIds = [...new Set(thread.messages.flatMap((m) => m.labelIds || []))];

  return {
    id: `${accountId}_${thread.id}`,
    account_id: accountId,
    provider_thread_id: thread.id,
    subject,
    snippet: cleanSnippet(thread.snippet || lastMessage.snippet || ''),
    participants,
    last_message_at: new Date(parseInt(lastMessage.internalDate, 10)).toISOString(),
    message_count: thread.messages.length,
    is_read: isRead,
    is_starred: isStarred,
    is_archived: isArchived,
    is_trashed: isTrashed,
    label_ids: labelIds,
    created_at: new Date(parseInt(firstMessage.internalDate, 10)).toISOString(),
    updated_at: new Date().toISOString(),
  };
};

// parseMultipartResponse moved to helpers/batch.ts

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

  const body = staleIds
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
  const responseBoundary = response.headers
    .get('content-type')
    ?.match(/boundary=(.+)/)?.[1] ?? boundary;

  const allParts = parseMultipartResponseWithStatus(responseText, responseBoundary);

  const successThreads: GmailThread[] = [];
  for (const part of allParts) {
    if (part.status >= 200 && part.status < 300 && part.body) {
      successThreads.push(part.body as GmailThread);
    } else if (part.contentId) {
      console.warn(
        `[Gmail] Failed to fetch thread ${part.contentId}: HTTP ${part.status} — removing from local DB`,
        part.body,
      );
      try { deleteThreadDb(`${accountId}_${part.contentId}`); } catch { /* non-blocking */ }
    }
  }

  const mapped = successThreads
    .map((thread) => mapGmailThreadToEmailThread(accountId, thread))
    .filter((t): t is EmailThread => t !== null);

  // Persist to SQLite
  try { upsertThreads(mapped); } catch { /* non-blocking */ }

  return mapped;
};

export const listThreads = async (
  accountId: string,
  labelIds: string[] = ['INBOX'],
  pagination?: CursorPagination,
): Promise<{ threads: EmailThread[]; nextPageToken?: string }> => {
  const params = new URLSearchParams({
    maxResults: String(pagination?.limit || 50),
    ...(labelIds.length && { labelIds: labelIds.join(',') }),
    ...(pagination?.cursor && { pageToken: pagination.cursor }),
  });

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
      try { upsertThreads([mapped]); } catch { /* non-blocking */ }
    }
    return mapped;
  } catch (error) {
    console.error(`Failed to get thread ${threadId}`, { error });
    return null;
  }
};
