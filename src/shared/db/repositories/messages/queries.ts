import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { messages, messageRecipients, attachments } from '../../schema';
import type {
  EmailMessage,
  EmailParticipant,
  EmailAttachment,
} from '@/src/shared/types';

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
    size_estimate: row.sizeEstimate ?? undefined,
    is_newsletter: row.isNewsletter ?? undefined,
    is_auto_reply: row.isAutoReply ?? undefined,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
