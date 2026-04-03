import { chunk } from '@/lib/chunk';
import type { EmailThread } from '@/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import { threadLabels, threads } from '../../schema';
import { CHUNK_SIZE, getThreadColumns, hydrateThreads } from './hydration';

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
