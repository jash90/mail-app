import type { EmailThread } from '@/src/shared/types';
import { fixTextEncoding } from '@/src/features/gmail/helpers';
import { formatRelativeDateCoarse } from '@/src/shared/services/formatDate';

export function threadToEmailProps(
  thread: EmailThread,
  importanceMap: Map<string, number> | undefined,
) {
  const firstParticipant = thread.participants[0];
  const email = firstParticipant?.email ?? '';
  const baseTier = importanceMap?.get(email.toLowerCase()) ?? 1;
  // Unread threads get minimum tier 3
  const importance = !thread.is_read ? Math.max(baseTier, 3) : baseTier;

  return {
    name: fixTextEncoding(firstParticipant?.name ?? email ?? 'Unknown'),
    email,
    subject: thread.subject,
    snippet: thread.snippet,
    isUnread: !thread.is_read,
    isNewsletter: thread.is_newsletter ?? false,
    isAutoReply: thread.is_auto_reply ?? false,
    sentAt: formatRelativeDateCoarse(thread.last_message_at),
    importance,
  };
}
