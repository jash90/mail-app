import type { EmailLabel } from '@/types';

const LABEL_DISPLAY_NAMES: Record<string, string> = {
  INBOX: 'Inbox',
  SENT: 'Sent',
  DRAFT: 'Drafts',
  TRASH: 'Trash',
  STARRED: 'Starred',
  SPAM: 'Spam',
  UNREAD: 'Unread',
  IMPORTANT: 'Important',
  CATEGORY_PERSONAL: 'Personal',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_UPDATES: 'Updates',
  CATEGORY_FORUMS: 'Forums',
};

export function getLabelDisplayName(
  labelId: string,
  labels?: EmailLabel[],
): string {
  if (LABEL_DISPLAY_NAMES[labelId]) return LABEL_DISPLAY_NAMES[labelId];
  const label = labels?.find((l) => l.id === labelId);
  return label?.name ?? labelId;
}
