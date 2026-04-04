import { chunk } from '@/lib/chunk';
import type { EmailThread } from '@/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import { threadLabels, threads } from '../../schema';
import {
  CHUNK_SIZE,
  getThreadColumns,
  getSenderEmails,
  hydrateThreads,
} from './hydration';
import { getContactImportanceMap } from '../stats';

export type SortMode =
  | 'recent'
  | 'oldest'
  | 'most_messages'
  | 'unread_first'
  | 'starred_first';

interface PaginationOptions {
  labelIds?: string[];
  sortMode?: SortMode;
  limit?: number;
  offset?: number;
}

/** Read threads from SQLite with SQL-based sorting and pagination. */
export function getThreadsPaginated(
  accountId: string,
  options: PaginationOptions = {},
): EmailThread[] {
  const { labelIds, sortMode = 'recent', limit = 50, offset = 0 } = options;

  // Build ORDER BY based on sort mode
  const orderBy = (() => {
    switch (sortMode) {
      case 'recent':
        return desc(threads.lastMessageAt);
      case 'oldest':
        return asc(threads.lastMessageAt);
      case 'most_messages':
        return desc(threads.messageCount);
      case 'unread_first':
        return asc(threads.isRead); // false (0) before true (1)
      case 'starred_first':
        return desc(threads.isStarred); // true (1) before false (0)
    }
  })();

  const threadColumns = getThreadColumns();

  const hasLabels = labelIds && labelIds.length > 0;
  const isTrashView = hasLabels && labelIds.includes('TRASH');
  const isSpamView = hasLabels && labelIds.includes('SPAM');
  const skipStatusFilter = isTrashView || isSpamView;

  const threadRows = hasLabels
    ? (() => {
        const results: (typeof threads.$inferSelect)[] = [];
        for (const batch of chunk(labelIds, CHUNK_SIZE)) {
          const conditions = [
            eq(threads.accountId, accountId),
            inArray(threadLabels.labelId, batch),
          ];
          if (!skipStatusFilter) {
            conditions.push(eq(threads.isTrashed, false));
            conditions.push(eq(threads.isArchived, false));
          }
          results.push(
            ...db
              .selectDistinct(threadColumns)
              .from(threads)
              .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
              .where(and(...conditions))
              .all(),
          );
        }
        // Deduplicate by thread ID (chunks may overlap on threads with multiple labels)
        const seen = new Set<string>();
        const deduped = results.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        // Re-sort — results from multiple chunks are interleaved
        deduped.sort((a, b) => {
          switch (sortMode) {
            case 'recent':
              return b.lastMessageAt.localeCompare(a.lastMessageAt);
            case 'oldest':
              return a.lastMessageAt.localeCompare(b.lastMessageAt);
            case 'most_messages':
              return b.messageCount - a.messageCount;
            case 'unread_first':
              return (a.isRead ? 1 : 0) - (b.isRead ? 1 : 0);
            case 'starred_first':
              return (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0);
          }
        });
        return deduped.slice(offset, offset + limit);
      })()
    : db
        .select()
        .from(threads)
        .where(
          and(
            eq(threads.accountId, accountId),
            eq(threads.isTrashed, false),
            eq(threads.isArchived, false),
          ),
        )
        .orderBy(orderBy, desc(threads.lastMessageAt))
        .limit(limit)
        .offset(offset)
        .all();

  return hydrateThreads(threadRows);
}

/** Get unread Inbox threads for an account, sorted by most recent. */
export function getUnreadThreads(accountId: string, limit = 20): EmailThread[] {
  const threadColumns = getThreadColumns();

  const threadRows = db
    .selectDistinct(threadColumns)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(
      and(
        eq(threads.accountId, accountId),
        eq(threads.isRead, false),
        eq(threadLabels.labelId, 'INBOX'),
      ),
    )
    .orderBy(desc(threads.lastMessageAt))
    .limit(limit)
    .all();

  return hydrateThreads(threadRows);
}

/** Get thread count for an account. */
export function getThreadCount(accountId: string): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(threads)
    .where(eq(threads.accountId, accountId))
    .get();
  return row?.count ?? 0;
}

/** Count unread INBOX threads in local SQLite. */
export function getLocalUnreadInboxCount(accountId: string): number {
  const row = db
    .select({ count: sql<number>`COUNT(DISTINCT ${threads.id})` })
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(
      and(
        eq(threads.accountId, accountId),
        eq(threads.isRead, false),
        eq(threadLabels.labelId, 'INBOX'),
      ),
    )
    .get();
  return row?.count ?? 0;
}

/**
 * Select top threads for AI summary using cascading tier selection (5→4→3→2→1).
 * Reads ALL unread INBOX metadata (lightweight), assigns tiers, picks top `limit`.
 */
export function selectThreadsForSummary(
  accountId: string,
  userEmail: string,
  limit: number = 20,
): EmailThread[] {
  const threadColumns = getThreadColumns();

  // 1. Fetch ALL unread INBOX thread rows (lightweight — no hydration yet)
  const allUnreadRows = db
    .selectDistinct(threadColumns)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(
      and(
        eq(threads.accountId, accountId),
        eq(threads.isRead, false),
        eq(threadLabels.labelId, 'INBOX'),
      ),
    )
    .orderBy(desc(threads.lastMessageAt))
    .all();

  if (allUnreadRows.length === 0) return [];

  // 2. Batch-fetch only sender emails (position=0) — much lighter than full hydration
  const senderMap = getSenderEmails(allUnreadRows.map((r) => r.id));

  // 3. Get importance tiers
  const importanceMap = getContactImportanceMap(accountId, userEmail);

  // 4. Assign tier to each thread
  const withTier = allUnreadRows.map((row) => ({
    row,
    tier: importanceMap.get(senderMap.get(row.id) ?? '') ?? 1,
  }));

  // 5. Cascading selection: tier 5 → 4 → 3 → 2 → 1, within tier sort by recency
  const selected: (typeof threads.$inferSelect)[] = [];
  for (let tier = 5; tier >= 1 && selected.length < limit; tier--) {
    const tierThreads = withTier
      .filter((t) => t.tier === tier)
      .sort((a, b) => b.row.lastMessageAt.localeCompare(a.row.lastMessageAt));
    for (const t of tierThreads) {
      if (selected.length >= limit) break;
      selected.push(t.row);
    }
  }

  // 6. Hydrate only the selected threads (max 20)
  return hydrateThreads(selected);
}
