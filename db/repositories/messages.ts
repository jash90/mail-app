import { eq, sql, and, like, inArray } from 'drizzle-orm';
import { db } from '../client';
import { messages, messageRecipients, attachments, participants } from '../schema';
import type { EmailMessage, EmailParticipant, EmailAttachment } from '@/types';
import type { StatMessage } from '@/features/stats/types';

/** Remove legacy stat messages with synthetic IDs (_stat_) to fix duplication. */
export function purgeOldStatMessages(accountId: string): number {
  const staleIds = db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), like(messages.id, '%_stat_%')))
    .all()
    .map((r) => r.id);

  if (staleIds.length === 0) return 0;

  db.transaction((tx) => {
    tx.delete(messageRecipients).where(inArray(messageRecipients.messageId, staleIds)).run();
    tx.delete(messages).where(inArray(messages.id, staleIds)).run();
  });
  return staleIds.length;
}

/** Batch upsert full messages with recipients and attachments. */
export function upsertMessages(messageList: EmailMessage[]): void {
  if (messageList.length === 0) return;

  db.transaction((tx) => {
    for (const msg of messageList) {
      tx.insert(messages)
        .values({
          id: msg.id,
          accountId: msg.account_id,
          providerMessageId: msg.provider_message_id,
          threadId: msg.thread_id,
          providerThreadId: msg.provider_thread_id,
          subject: msg.subject,
          snippet: msg.snippet,
          fromEmail: msg.from.email.toLowerCase(),
          fromName: msg.from.name,
          bodyText: msg.body.text,
          bodyHtml: msg.body.html,
          headerMessageId: msg.headers.message_id,
          headerInReplyTo: msg.headers.in_reply_to ?? null,
          headerReferences: msg.headers.references
            ? JSON.stringify(msg.headers.references)
            : null,
          createdAt: msg.created_at,
          updatedAt: msg.updated_at,
        })
        .onConflictDoUpdate({
          target: messages.id,
          set: {
            subject: sql`excluded.subject`,
            snippet: sql`excluded.snippet`,
            fromEmail: sql`excluded.from_email`,
            fromName: sql`excluded.from_name`,
            bodyText: sql`excluded.body_text`,
            bodyHtml: sql`excluded.body_html`,
            headerMessageId: sql`excluded.header_message_id`,
            headerInReplyTo: sql`excluded.header_in_reply_to`,
            headerReferences: sql`excluded.header_references`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();

      // Replace recipients
      tx.delete(messageRecipients)
        .where(eq(messageRecipients.messageId, msg.id))
        .run();

      const addRecipients = (list: EmailParticipant[], type: 'to' | 'cc' | 'bcc') => {
        for (const r of list) {
          tx.insert(messageRecipients)
            .values({
              messageId: msg.id,
              type,
              email: r.email.toLowerCase(),
              name: r.name,
            })
            .run();
        }
      };

      addRecipients(msg.to, 'to');
      addRecipients(msg.cc, 'cc');
      addRecipients(msg.bcc, 'bcc');

      // Replace attachments
      tx.delete(attachments).where(eq(attachments.messageId, msg.id)).run();
      for (const att of msg.attachments) {
        tx.insert(attachments)
          .values({
            id: att.id,
            messageId: msg.id,
            filename: att.filename,
            mimeType: att.mime_type,
            size: att.size,
            contentId: att.content_id ?? null,
            isInline: att.is_inline,
          })
          .run();
      }

      // Also upsert sender into participants table
      tx.insert(participants)
        .values({ email: msg.from.email.toLowerCase(), name: msg.from.name })
        .onConflictDoUpdate({
          target: participants.email,
          set: { name: sql`COALESCE(excluded.name, participants.name)` },
        })
        .run();
    }
  });
}

/**
 * Lightweight upsert for stats — only from/to/cc/bcc/date, no body.
 * Uses INSERT OR IGNORE so full messages fetched later are not overwritten.
 */
export function upsertStatMessages(
  accountId: string,
  threadId: string,
  providerThreadId: string,
  statMessages: StatMessage[],
): void {
  if (statMessages.length === 0) return;

  db.transaction((tx) => {
    for (let i = 0; i < statMessages.length; i++) {
      const sm = statMessages[i];
      const msgId = sm.id; // Use real Gmail message ID to avoid duplicates
      const createdAt = new Date(sm.date).toISOString();

      tx.insert(messages)
        .values({
          id: msgId,
          accountId,
          providerMessageId: msgId,
          threadId,
          providerThreadId,
          subject: '',
          snippet: '',
          fromEmail: sm.from,
          fromName: null,
          bodyText: '',
          bodyHtml: '',
          headerMessageId: null,
          headerInReplyTo: null,
          headerReferences: null,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing()
        .run();

      // Recipients — only insert if message was new
      const addRecipients = (list: string[], type: 'to' | 'cc' | 'bcc') => {
        for (const email of list) {
          tx.insert(messageRecipients)
            .values({ messageId: msgId, type, email, name: null })
            .onConflictDoNothing()
            .run();
        }
      };

      addRecipients(sm.to, 'to');
      addRecipients(sm.cc, 'cc');
      addRecipients(sm.bcc, 'bcc');

      // Upsert sender into participants
      tx.insert(participants)
        .values({ email: sm.from, name: null })
        .onConflictDoNothing()
        .run();
    }
  });
}

/** Get all messages for a thread, hydrated with recipients and attachments. */
export function getMessagesByThread(threadId: string): EmailMessage[] {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt)
    .all();

  return rows.map(hydrateMessage);
}

// --- Helpers ---

function hydrateMessage(row: typeof messages.$inferSelect): EmailMessage {
  const recipientRows = db
    .select()
    .from(messageRecipients)
    .where(eq(messageRecipients.messageId, row.id))
    .all();

  const toList: EmailParticipant[] = [];
  const ccList: EmailParticipant[] = [];
  const bccList: EmailParticipant[] = [];

  for (const r of recipientRows) {
    const participant = { email: r.email, name: r.name };
    if (r.type === 'to') toList.push(participant);
    else if (r.type === 'cc') ccList.push(participant);
    else bccList.push(participant);
  }

  const attachmentRows = db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, row.id))
    .all();

  const emailAttachments: EmailAttachment[] = attachmentRows.map((a) => ({
    id: a.id,
    message_id: a.messageId,
    filename: a.filename,
    mime_type: a.mimeType,
    size: a.size,
    content_id: a.contentId ?? undefined,
    is_inline: a.isInline,
  }));

  return {
    id: row.id,
    account_id: row.accountId,
    provider_message_id: row.providerMessageId,
    thread_id: row.threadId,
    provider_thread_id: row.providerThreadId,
    subject: row.subject,
    snippet: row.snippet,
    from: { email: row.fromEmail, name: row.fromName },
    to: toList,
    cc: ccList,
    bcc: bccList,
    reply_to: null,
    body: { text: row.bodyText, html: row.bodyHtml },
    attachments: emailAttachments,
    headers: {
      message_id: row.headerMessageId ?? '',
      in_reply_to: row.headerInReplyTo ?? undefined,
      references: row.headerReferences
        ? JSON.parse(row.headerReferences)
        : undefined,
    },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
