import { chunk } from '@/lib/chunk';
import type { EmailThread } from '@/types';
import type { QuickFilters } from '@/features/search';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import { threadLabels, threads } from '../../schema';
import { CHUNK_SIZE, getThreadColumns, hydrateThreads } from './hydration';

/** Quick count check — how many of the candidate IDs already exist locally. */
export function countExistingThreads(
  accountId: string,
  candidateIds: string[],
): number {
  if (candidateIds.length === 0) return 0;
  return findMatchingProviderThreadIds(accountId, candidateIds).size;
}

/** Find provider thread IDs from candidateIds that match an extra WHERE condition (or all existing ones). */
function findMatchingProviderThreadIds(
  accountId: string,
  candidateIds: string[],
  extraCondition?: ReturnType<typeof sql>,
): Set<string> {
  const result = new Set<string>();

  for (const batch of chunk(candidateIds, CHUNK_SIZE)) {
    const conditions = [
      eq(threads.accountId, accountId),
      inArray(threads.providerThreadId, batch),
      ...(extraCondition ? [extraCondition] : []),
    ];

    const rows = db
      .select({ providerThreadId: threads.providerThreadId })
      .from(threads)
      .where(and(...conditions))
      .all();

    for (const r of rows) result.add(r.providerThreadId);
  }

  return result;
}

/** Filter out provider thread IDs that already exist in local DB — returns only missing ones. */
export function filterNewProviderThreadIds(
  accountId: string,
  candidateIds: string[],
): string[] {
  if (candidateIds.length === 0) return [];
  const existingSet = findMatchingProviderThreadIds(accountId, candidateIds);
  return candidateIds.filter((id) => !existingSet.has(id));
}

/** Filter out provider thread IDs that were updated within the last `maxAgeMs` — returns only stale/missing ones. */
export function filterStaleProviderThreadIds(
  accountId: string,
  candidateIds: string[],
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): string[] {
  if (candidateIds.length === 0) return [];
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const freshSet = findMatchingProviderThreadIds(
    accountId,
    candidateIds,
    sql`${threads.updatedAt} > ${cutoff}`,
  );
  return candidateIds.filter((id) => !freshSet.has(id));
}

/** Search threads by IDs (from FTS5) with quick filter conditions. */
export function searchThreadsWithFilters(
  accountId: string,
  threadIds: string[],
  filters: QuickFilters,
): EmailThread[] {
  if (threadIds.length === 0) return [];

  const conditions: ReturnType<typeof eq>[] = [
    eq(threads.accountId, accountId),
  ];

  if (filters.isUnread) conditions.push(eq(threads.isRead, false));
  if (filters.isStarred) conditions.push(eq(threads.isStarred, true));
  if (filters.isNewsletter) conditions.push(eq(threads.isNewsletter, true));
  if (filters.isAutoReply) conditions.push(eq(threads.isAutoReply, true));

  if (filters.timeRange && filters.timeRange !== 'all') {
    const cutoff = getTimeRangeCutoff(filters.timeRange);
    conditions.push(gt(threads.lastMessageAt, cutoff));
  }

  // Fetch matching threads in chunks (respecting threadIds order from FTS5)
  const allRows: (typeof threads.$inferSelect)[] = [];
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const hasLabels = filters.labelIds && filters.labelIds.length > 0;

    const rows = hasLabels
      ? db
          .selectDistinct(getThreadColumns())
          .from(threads)
          .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
          .where(
            and(
              ...conditions,
              inArray(threads.id, batch),
              inArray(threadLabels.labelId, filters.labelIds!),
            ),
          )
          .all()
      : db
          .select()
          .from(threads)
          .where(and(...conditions, inArray(threads.id, batch)))
          .all();

    allRows.push(...rows);
  }

  // Preserve FTS5 ranking order
  const orderMap = new Map(threadIds.map((id, i) => [id, i]));
  allRows.sort(
    (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999),
  );

  // Deduplicate (label join may produce dupes)
  const seen = new Set<string>();
  const deduped = allRows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return hydrateThreads(deduped);
}

function getTimeRangeCutoff(range: 'week' | 'month' | 'year'): string {
  const now = new Date();
  switch (range) {
    case 'week':
      now.setDate(now.getDate() - 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      now.setFullYear(now.getFullYear() - 1);
      break;
  }
  return now.toISOString();
}
