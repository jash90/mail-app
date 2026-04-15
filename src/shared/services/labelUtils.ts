import type { EmailLabel } from '@/src/shared/types';

const SYSTEM_LABEL_ORDER = [
  'INBOX',
  'STARRED',
  'SENT',
  'DRAFT',
  'SPAM',
  'TRASH',
];

export function sortLabels(labels: EmailLabel[]): EmailLabel[] {
  const ordered = labels
    .filter((l) => SYSTEM_LABEL_ORDER.includes(l.id))
    .sort(
      (a, b) =>
        SYSTEM_LABEL_ORDER.indexOf(a.id) - SYSTEM_LABEL_ORDER.indexOf(b.id),
    );
  const otherSystem = labels
    .filter((l) => l.type === 'system' && !SYSTEM_LABEL_ORDER.includes(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const user = labels
    .filter((l) => l.type === 'user')
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...otherSystem, ...user];
}

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
