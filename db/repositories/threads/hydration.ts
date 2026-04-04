import { chunk } from '@/lib/chunk';
import type { EmailParticipant, EmailThread } from '@/types';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  participants,
  threadLabels,
  threadParticipants,
  threads,
} from '../../schema';

/** SQLite max host parameters — stay well under the 999 limit. */
export const CHUNK_SIZE = 500;

export function getThreadColumns() {
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

/** Map a single DB row to the EmailThread domain type. */
function mapRowToThread(
  row: typeof threads.$inferSelect,
  participantList: EmailParticipant[],
  labelIds: string[],
): EmailThread {
  return {
    id: row.id,
    account_id: row.accountId,
    provider_thread_id: row.providerThreadId,
    subject: row.subject,
    snippet: row.snippet,
    participants: participantList,
    last_message_at: row.lastMessageAt,
    message_count: row.messageCount,
    is_read: row.isRead,
    is_starred: row.isStarred,
    is_archived: row.isArchived,
    is_trashed: row.isTrashed,
    is_newsletter: row.isNewsletter ?? false,
    is_auto_reply: row.isAutoReply ?? false,
    label_ids: labelIds,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Batch-hydrate multiple thread rows with 2 queries instead of 2×N. */
export function hydrateThreads(
  rows: (typeof threads.$inferSelect)[],
): EmailThread[] {
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

  return rows.map((row) =>
    mapRowToThread(
      row,
      participantsByThread.get(row.id) ?? [],
      labelsByThread.get(row.id) ?? [],
    ),
  );
}

/**
 * Batch-fetch only the sender (position=0) email for each thread.
 * Much lighter than full hydration — used for tier-based selection.
 */
export function getSenderEmails(threadIds: string[]): Map<string, string> {
  if (threadIds.length === 0) return new Map();

  const result = new Map<string, string>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const rows = db
      .select({
        threadId: threadParticipants.threadId,
        email: participants.email,
      })
      .from(threadParticipants)
      .innerJoin(
        participants,
        eq(threadParticipants.participantId, participants.id),
      )
      .where(
        and(
          inArray(threadParticipants.threadId, batch),
          eq(threadParticipants.position, 0),
        ),
      )
      .all();

    for (const r of rows) {
      result.set(r.threadId, r.email.toLowerCase());
    }
  }
  return result;
}

/** Hydrate a single thread row — used by getThreadById where N+1 is not an issue. */
export function hydrateThread(row: typeof threads.$inferSelect): EmailThread {
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

  const labelRows = db
    .select({ labelId: threadLabels.labelId })
    .from(threadLabels)
    .where(eq(threadLabels.threadId, row.id))
    .all();

  return mapRowToThread(
    row,
    emailParticipants,
    labelRows.map((l) => l.labelId),
  );
}
