import type { EmailMessage } from '@/src/shared/types';
import type { GmailThread, GmailMessage } from '../types';
import { gmailRequest } from './api';
import {
  getHeader,
  parseEmailAddress,
  parseEmailAddressList,
  extractBody,
  extractAttachments,
  cleanHeaderText,
  cleanSnippet,
} from '../helpers';
import { upsertMessages } from '@/src/shared/db/repositories/messages';

export const getMessage = async (
  accountId: string,
  messageId: string,
): Promise<EmailMessage | null> => {
  const message = await gmailRequest<GmailMessage>(
    `/messages/${messageId}?format=full`,
  );
  return parseGmailMessage(accountId, message);
};

export const getThreadMessages = async (
  accountId: string,
  threadId: string,
): Promise<EmailMessage[]> => {
  const thread = await gmailRequest<GmailThread>(
    `/threads/${threadId}?format=full`,
  );

  if (!thread.messages) return [];

  const parsed = thread.messages.map((m) => parseGmailMessage(accountId, m));
  const valid = parsed.filter((m): m is EmailMessage => m !== null);

  // Persist to SQLite
  try {
    upsertMessages(valid);
  } catch {
    /* non-blocking */
  }

  return valid;
};

export const parseGmailMessage = (
  accountId: string,
  message: GmailMessage,
): EmailMessage | null => {
  try {
    const headers = message.payload.headers;
    const from = parseEmailAddress(getHeader(headers, 'From') || '');
    const to = parseEmailAddressList(getHeader(headers, 'To') || '');
    const cc = parseEmailAddressList(getHeader(headers, 'Cc') || '');
    const bcc = parseEmailAddressList(getHeader(headers, 'Bcc') || '');
    const replyTo = getHeader(headers, 'Reply-To')
      ? parseEmailAddress(getHeader(headers, 'Reply-To')!)
      : null;
    const { text, html } = extractBody(message.payload);
    const attachments = extractAttachments(message.id, message.payload);

    const listId = getHeader(headers, 'List-Id') || '';
    const listUnsubscribe = getHeader(headers, 'List-Unsubscribe') || '';
    const autoSubmitted = getHeader(headers, 'Auto-Submitted') || '';

    return {
      id: `${accountId}_${message.id}`,
      account_id: accountId,
      provider_message_id: message.id,
      thread_id: `${accountId}_${message.threadId}`,
      provider_thread_id: message.threadId,
      subject: cleanHeaderText(headers, 'Subject', '(No Subject)'),
      snippet: cleanSnippet(message.snippet),
      from,
      to,
      cc,
      bcc,
      reply_to: replyTo,
      body: { text, html },
      attachments,
      headers: {
        message_id: getHeader(headers, 'Message-ID') || '',
        in_reply_to: getHeader(headers, 'In-Reply-To'),
        references: getHeader(headers, 'References')?.split(/\s+/),
      },
      size_estimate: message.sizeEstimate,
      is_newsletter: listId !== '' || listUnsubscribe !== '',
      is_auto_reply:
        autoSubmitted !== '' && autoSubmitted.toLowerCase() !== 'no',
      created_at: new Date(parseInt(message.internalDate, 10)).toISOString(),
      updated_at: new Date(parseInt(message.internalDate, 10)).toISOString(),
    };
  } catch (error) {
    console.error('Failed to parse message', { error });
    return null;
  }
};
