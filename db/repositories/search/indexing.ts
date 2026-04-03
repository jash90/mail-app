import { db, expoDb } from '../../client';
import { sql } from 'drizzle-orm';
import {
  threads,
  participants,
  threadParticipants,
  threadLabels,
  labels,
  messageRecipients,
  messages,
} from '../../schema';
import { eq, inArray, asc } from 'drizzle-orm';
import { chunk } from '@/lib/chunk';

const CHUNK_SIZE = 500;

/**
 * Rebuild the entire FTS index from current data.
 * Joins threads + participants + messageRecipients + labels.
 * Call after sync operations.
 */
export function rebuildFTSIndex(accountId: string): void {
  // Clear existing FTS data
  db.run(sql`DELETE FROM email_fts`);

  // Get all threads for account
  const threadRows = db
    .select({
      id: threads.id,
      subject: threads.subject,
      snippet: threads.snippet,
    })
    .from(threads)
    .where(eq(threads.accountId, accountId))
    .all();

  if (threadRows.length === 0) return;

  const threadIds = threadRows.map((t) => t.id);

  // Batch fetch first participant (sender) for each thread
  const senderMap = new Map<string, { name: string; email: string }>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const rows = db
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

    for (const r of rows) {
      if (!senderMap.has(r.threadId)) {
        senderMap.set(r.threadId, { name: r.name ?? '', email: r.email });
      }
    }
  }

  // Batch fetch recipients (to/cc) per thread via messages
  const recipientMap = new Map<string, string>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const rows = db
      .select({
        threadId: messages.threadId,
        email: messageRecipients.email,
      })
      .from(messageRecipients)
      .innerJoin(messages, eq(messageRecipients.messageId, messages.id))
      .where(inArray(messages.threadId, batch))
      .all();

    for (const r of rows) {
      const existing = recipientMap.get(r.threadId) ?? '';
      if (!existing.includes(r.email)) {
        recipientMap.set(
          r.threadId,
          existing ? `${existing} ${r.email}` : r.email,
        );
      }
    }
  }

  // Batch fetch label names per thread
  const labelMap = new Map<string, string>();
  for (const batch of chunk(threadIds, CHUNK_SIZE)) {
    const rows = db
      .select({
        threadId: threadLabels.threadId,
        name: labels.name,
      })
      .from(threadLabels)
      .innerJoin(labels, eq(threadLabels.labelId, labels.id))
      .where(inArray(threadLabels.threadId, batch))
      .all();

    for (const r of rows) {
      const existing = labelMap.get(r.threadId) ?? '';
      labelMap.set(r.threadId, existing ? `${existing} ${r.name}` : r.name);
    }
  }

  // Insert into FTS in a transaction using expo-sqlite's native transaction
  expoDb.withTransactionSync(() => {
    for (const t of threadRows) {
      const sender = senderMap.get(t.id);
      const toEmails = recipientMap.get(t.id) ?? '';
      const labelNames = labelMap.get(t.id) ?? '';

      db.run(
        sql`INSERT INTO email_fts(thread_id, subject, snippet, from_name, from_email, to_emails, label_names)
            VALUES (${t.id}, ${t.subject}, ${t.snippet}, ${sender?.name ?? ''}, ${sender?.email ?? ''}, ${toEmails}, ${labelNames})`,
      );
    }
  });
}

/**
 * Update or insert a single FTS entry for a thread.
 * Call after upserting individual threads.
 */
export function updateFTSEntry(threadId: string): void {
  const thread = db
    .select({
      id: threads.id,
      subject: threads.subject,
      snippet: threads.snippet,
    })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get();

  if (!thread) return;

  // Get sender
  const sender = db
    .select({ email: participants.email, name: participants.name })
    .from(threadParticipants)
    .innerJoin(
      participants,
      eq(threadParticipants.participantId, participants.id),
    )
    .where(eq(threadParticipants.threadId, threadId))
    .orderBy(asc(threadParticipants.position))
    .limit(1)
    .get();

  // Get recipients
  const recipientRows = db
    .select({ email: messageRecipients.email })
    .from(messageRecipients)
    .innerJoin(messages, eq(messageRecipients.messageId, messages.id))
    .where(eq(messages.threadId, threadId))
    .all();
  const toEmails = [...new Set(recipientRows.map((r) => r.email))].join(' ');

  // Get labels
  const labelRows = db
    .select({ name: labels.name })
    .from(threadLabels)
    .innerJoin(labels, eq(threadLabels.labelId, labels.id))
    .where(eq(threadLabels.threadId, threadId))
    .all();
  const labelNames = labelRows.map((r) => r.name).join(' ');

  // Delete old entry and insert new
  db.run(sql`DELETE FROM email_fts WHERE thread_id = ${threadId}`);
  db.run(
    sql`INSERT INTO email_fts(thread_id, subject, snippet, from_name, from_email, to_emails, label_names)
        VALUES (${threadId}, ${thread.subject}, ${thread.snippet}, ${sender?.name ?? ''}, ${sender?.email ?? ''}, ${toEmails}, ${labelNames})`,
  );
}

/**
 * Batch update FTS entries for multiple threads.
 */
export function updateFTSEntries(threadIds: string[]): void {
  if (threadIds.length === 0) return;
  for (const id of threadIds) {
    updateFTSEntry(id);
  }
}
