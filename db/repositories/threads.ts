import { chunk } from '@/lib/chunk';
import type { EmailParticipant, EmailThread } from '@/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  labels,
  participants,
  threadLabels,
  threadParticipants,
  threads,
} from '../schema';

/** SQLite max host parameters — stay well under the 999 limit. */
const CHUNK_SIZE = 500;

/** Batch upsert threads with their participants and labels in a single transaction. */
export function upsertThreads(threadList: EmailThread[]): void {
  if (threadList.length === 0) return;

  db.transaction((tx) => {
    // Ensure all referenced label rows exist so FK on thread_labels is satisfied
    const seenLabels = new Set<string>();
    for (const t of threadList) {
      for (const labelId of t.label_ids) {
        if (seenLabels.has(labelId)) continue;
        seenLabels.add(labelId);
        tx.insert(labels)
          .values({
            id: labelId,
            accountId: t.account_id,
            providerLabelId: labelId,
            name: labelId,
            type: 'system',
          })
          .onConflictDoNothing()
          .run();
      }
    }

    for (const t of threadList) {
      // Upsert thread
      tx.insert(threads)
        .values({
          id: t.id,
          accountId: t.account_id,
          providerThreadId: t.provider_thread_id,
          subject: t.subject,
          snippet: t.snippet,
          lastMessageAt: t.last_message_at,
          messageCount: t.message_count,
          isRead: t.is_read,
          isStarred: t.is_starred,
          isArchived: t.is_archived,
          isTrashed: t.is_trashed,
          isNewsletter: t.is_newsletter ?? false,
          isAutoReply: t.is_auto_reply ?? false,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })
        .onConflictDoUpdate({
          target: threads.id,
          set: {
            subject: sql`excluded.subject`,
            snippet: sql`excluded.snippet`,
            lastMessageAt: sql`excluded.last_message_at`,
            messageCount: sql`excluded.message_count`,
            isRead: sql`excluded.is_read`,
            isStarred: sql`excluded.is_starred`,
            isArchived: sql`excluded.is_archived`,
            isTrashed: sql`excluded.is_trashed`,
            isNewsletter: sql`excluded.is_newsletter`,
            isAutoReply: sql`excluded.is_auto_reply`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();

      // Replace labels
      tx.delete(threadLabels).where(eq(threadLabels.threadId, t.id)).run();
      for (const labelId of t.label_ids) {
        tx.insert(threadLabels)
          .values({ threadId: t.id, labelId })
          .onConflictDoNothing()
          .run();
      }

      // Replace participants
      tx.delete(threadParticipants)
        .where(eq(threadParticipants.threadId, t.id))
        .run();

      for (let i = 0; i < t.participants.length; i++) {
        const p = t.participants[i];
        const email = p.email.toLowerCase();

        // Upsert participant and get ID in one statement (avoids extra SELECT)
        const row = tx
          .insert(participants)
          .values({ email, name: p.name })
          .onConflictDoUpdate({
            target: participants.email,
            set: { name: sql`COALESCE(excluded.name, participants.name)` },
          })
          .returning({ id: participants.id })
          .get();

        if (row) {
          tx.insert(threadParticipants)
            .values({ threadId: t.id, participantId: row.id, position: i })
            .onConflictDoNothing()
            .run();
        }
      }
    }
  });
}

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
  const threadRows = hasLabels
    ? (() => {
        const results: (typeof threads.$inferSelect)[] = [];
        for (const batch of chunk(labelIds, CHUNK_SIZE)) {
          results.push(
            ...db
              .selectDistinct(threadColumns)
              .from(threads)
              .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
              .where(
                and(
                  eq(threads.accountId, accountId),
                  inArray(threadLabels.labelId, batch),
                ),
              )
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
        .where(eq(threads.accountId, accountId))
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

function getThreadColumns() {
  return {
    id: threads.id,
    accountId: threads.accountId,
    providerThreadId: threads.providerThreadId,
    subject: threads.subject,
    snippet: threads.snippet,
    lastMessageAt: threads.lastMessageAt,
    messageCount: threads.messageCount,
    isRead: threads.isRead,
    isStarred: threads.isStarred,
    isArchived: threads.isArchived,
    isTrashed: threads.isTrashed,
    isNewsletter: threads.isNewsletter,
    isAutoReply: threads.isAutoReply,
    createdAt: threads.createdAt,
    updatedAt: threads.updatedAt,
  };
}

/** Update thread flags (is_read, is_starred, etc.). */
export function updateThreadFlags(
  id: string,
  flags: Partial<{
    is_read: boolean;
    is_starred: boolean;
    is_archived: boolean;
    is_trashed: boolean;
  }>,
): void {
  const set: Partial<typeof threads.$inferInsert> = {};
  if (flags.is_read !== undefined) set.isRead = flags.is_read;
  if (flags.is_starred !== undefined) set.isStarred = flags.is_starred;
  if (flags.is_archived !== undefined) set.isArchived = flags.is_archived;
  if (flags.is_trashed !== undefined) set.isTrashed = flags.is_trashed;

  if (Object.keys(set).length === 0) return;

  db.update(threads).set(set).where(eq(threads.id, id)).run();
}

/** Delete a thread and all related data (cascade). */
export function deleteThread(id: string): void {
  db.delete(threads).where(eq(threads.id, id)).run();
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

/** Remove threads from DB whose providerThreadId is NOT in the given API list (i.e. no longer in INBOX). */
export function purgeThreadsNotInList(
  accountId: string,
  apiThreadIds: string[],
): number {
  if (apiThreadIds.length === 0) return 0;

  // Get all local provider thread IDs for this account
  const localRows = db
    .select({ id: threads.id, providerThreadId: threads.providerThreadId })
    .from(threads)
    .where(eq(threads.accountId, accountId))
    .all();

  const apiSet = new Set(apiThreadIds);
  const toDelete = localRows.filter((r) => !apiSet.has(r.providerThreadId));

  if (toDelete.length === 0) return 0;

  // Bulk delete in chunks — cascades handle threadLabels, threadParticipants, messages
  const idsToDelete = toDelete.map((r) => r.id);
  db.transaction((tx) => {
    for (const batch of chunk(idsToDelete, CHUNK_SIZE)) {
      tx.delete(threads).where(inArray(threads.id, batch)).run();
    }
  });
  return toDelete.length;
}

// --- Helpers ---

/** Batch-hydrate multiple thread rows with 2 queries instead of 2×N. */
function hydrateThreads(rows: (typeof threads.$inferSelect)[]): EmailThread[] {
  if (rows.length === 0) return [];

  const threadIds = rows.map((r) => r.id);

  // Batch fetch all participants for all threads (chunked)
  const participantsByThread = new Map<string, EmailParticipant[]>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const batchRows = db
      .select({
        threadId: threadParticipants.threadId,
        email: participants.email,
        name: participants.name,
        position: threadParticipants.position,
      })
      .from(threadParticipants)
      .innerJoin(
        participants,
        eq(threadParticipants.participantId, participants.id),
      )
      .where(inArray(threadParticipants.threadId, batch))
      .orderBy(asc(threadParticipants.position))
      .all();

    for (const p of batchRows) {
      let list = participantsByThread.get(p.threadId);
      if (!list) {
        list = [];
        participantsByThread.set(p.threadId, list);
      }
      list.push({ email: p.email, name: p.name });
    }
  }

  // Batch fetch all labels for all threads (chunked)
  const labelsByThread = new Map<string, string[]>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const batchRows = db
      .select({
        threadId: threadLabels.threadId,
        labelId: threadLabels.labelId,
      })
      .from(threadLabels)
      .where(inArray(threadLabels.threadId, batch))
      .all();

    for (const l of batchRows) {
      let list = labelsByThread.get(l.threadId);
      if (!list) {
        list = [];
        labelsByThread.set(l.threadId, list);
      }
      list.push(l.labelId);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    account_id: row.accountId,
    provider_thread_id: row.providerThreadId,
    subject: row.subject,
    snippet: row.snippet,
    participants: participantsByThread.get(row.id) ?? [],
    last_message_at: row.lastMessageAt,
    message_count: row.messageCount,
    is_read: row.isRead,
    is_starred: row.isStarred,
    is_archived: row.isArchived,
    is_trashed: row.isTrashed,
    is_newsletter: row.isNewsletter ?? false,
    is_auto_reply: row.isAutoReply ?? false,
    label_ids: labelsByThread.get(row.id) ?? [],
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));
}

/** Hydrate a single thread row — used by getThreadById where N+1 is not an issue. */
function hydrateThread(row: typeof threads.$inferSelect): EmailThread {
  // Get participants
  const participantRows = db
    .select({
      email: participants.email,
      name: participants.name,
    })
    .from(threadParticipants)
    .innerJoin(
      participants,
      eq(threadParticipants.participantId, participants.id),
    )
    .where(eq(threadParticipants.threadId, row.id))
    .orderBy(asc(threadParticipants.position))
    .all();

  const emailParticipants: EmailParticipant[] = participantRows.map((p) => ({
    email: p.email,
    name: p.name,
  }));

  // Get labels
  const labelRows = db
    .select({ labelId: threadLabels.labelId })
    .from(threadLabels)
    .where(eq(threadLabels.threadId, row.id))
    .all();

  return {
    id: row.id,
    account_id: row.accountId,
    provider_thread_id: row.providerThreadId,
    subject: row.subject,
    snippet: row.snippet,
    participants: emailParticipants,
    last_message_at: row.lastMessageAt,
    message_count: row.messageCount,
    is_read: row.isRead,
    is_starred: row.isStarred,
    is_archived: row.isArchived,
    is_trashed: row.isTrashed,
    is_newsletter: row.isNewsletter ?? false,
    is_auto_reply: row.isAutoReply ?? false,
    label_ids: labelRows.map((l) => l.labelId),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
