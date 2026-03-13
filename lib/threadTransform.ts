import type { EmailThread } from '@/types';
import { fixTextEncoding } from '@/features/gmail/helpers';
import { formatRelativeDateCoarse } from '@/lib/formatDate';

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
    sentAt: formatRelativeDateCoarse(thread.last_message_at),
    importance,
  };
}
