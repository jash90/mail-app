import { chunk } from '@/src/shared/services/chunk';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import { threads } from '../../schema';
import { CHUNK_SIZE } from './hydration';

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
