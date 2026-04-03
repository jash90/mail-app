import {
  filterStaleProviderThreadIds,
  purgeThreadsNotInList,
} from '@/db/repositories/threads';
import { gmailRequest } from '@/features/gmail/api';
import type { EmailThread } from '@/types';
import { delay } from '@/lib/rateLimiter';
import type { StatMessage, StatsProgress } from './types';
import { processBatchQueue } from './batchFetcher';

const MAX_RETRY_ROUNDS = 5;

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

export async function fetchAllMessages(
  accountId: string,
  onProgress?: (progress: StatsProgress) => void,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<FetchAllMessagesResult> {
  const allThreadIds = await listAllThreadIds(['INBOX', 'SENT'], onProgress);
  const totalListedCount = allThreadIds.length;

  // Remove threads from DB that are no longer in INBOX
  const purgedCount = purgeThreadsNotInList(accountId, allThreadIds);

  // Filter out threads that are fresh in the local DB (updated < 24h ago)
  const staleIds = filterStaleProviderThreadIds(accountId, allThreadIds);
  const cachedCount = totalListedCount - staleIds.length;

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
