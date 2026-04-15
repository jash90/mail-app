import type { EmailThread } from '@/src/shared/types';
import type { GmailThread } from '../types';
import {
  extractParticipants,
  cleanHeaderText,
  cleanSnippet,
  getHeader,
} from '../helpers';

/**
 * Maps a raw Gmail thread to our normalized EmailThread type.
 */
export const mapGmailThreadToEmailThread = (
  accountId: string,
  thread: GmailThread,
): EmailThread | null => {
  if (!thread.messages || thread.messages.length === 0) {
    return null;
  }

  // Guard guarantees at least one message; non-null assertions are safe here.
  const firstMessage = thread.messages[0]!;
  const lastMessage = thread.messages[thread.messages.length - 1]!;
  const participants = extractParticipants(thread.messages);
  const subject = cleanHeaderText(
    firstMessage.payload.headers,
    'Subject',
    '(No Subject)',
  );

  const isRead = !thread.messages.some((m) => m.labelIds?.includes('UNREAD'));
  const isStarred = thread.messages.some((m) =>
    m.labelIds?.includes('STARRED'),
  );
  const isArchived = !thread.messages.some((m) =>
    m.labelIds?.includes('INBOX'),
  );
  const isTrashed = thread.messages.some((m) => m.labelIds?.includes('TRASH'));
  const labelIds = [
    ...new Set(thread.messages.flatMap((m) => m.labelIds || [])),
  ];

  const isNewsletter = thread.messages.some((m) => {
    const h = m.payload.headers;
    return !!(getHeader(h, 'List-Id') || getHeader(h, 'List-Unsubscribe'));
  });
  const isAutoReply = thread.messages.some((m) => {
    const auto = getHeader(m.payload.headers, 'Auto-Submitted') || '';
    return auto !== '' && auto.toLowerCase() !== 'no';
  });

  return {
    id: `${accountId}_${thread.id}`,
    account_id: accountId,
    provider_thread_id: thread.id,
    subject,
    snippet: cleanSnippet(thread.snippet || lastMessage.snippet || ''),
    participants,
    last_message_at: new Date(
      parseInt(lastMessage.internalDate, 10),
    ).toISOString(),
    message_count: thread.messages.length,
    is_read: isRead,
    is_starred: isStarred,
    is_archived: isArchived,
    is_trashed: isTrashed,
    is_newsletter: isNewsletter,
    is_auto_reply: isAutoReply,
    label_ids: labelIds,
    created_at: new Date(parseInt(firstMessage.internalDate, 10)).toISOString(),
    updated_at: new Date().toISOString(),
  };
};
