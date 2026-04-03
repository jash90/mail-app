import type { EmailThread } from '@/types';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../client';
import {
  labels,
  participants,
  threadLabels,
  threadParticipants,
  threads,
} from '../../schema';

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
