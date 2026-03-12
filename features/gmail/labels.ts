import type { EmailLabel } from '@/types';
import type { GmailLabel } from './types';
import { gmailRequest } from './api';

const mapGmailLabel = (accountId: string, label: GmailLabel): EmailLabel => ({
  id: label.id,
  account_id: accountId,
  provider_label_id: label.id,
  name: label.name,
  type: label.type,
  color: label.color?.backgroundColor,
  message_count: label.messagesTotal,
  unread_count: label.messagesUnread,
});

export const getLabels = async (accountId: string): Promise<EmailLabel[]> => {
  const response = await gmailRequest<{ labels: GmailLabel[] }>('/labels');
  return response.labels.map((label) => mapGmailLabel(accountId, label));
};

export const getLabelById = async (
  accountId: string,
  labelId: string,
): Promise<EmailLabel> => {
  const label = await gmailRequest<GmailLabel>(`/labels/${labelId}`);
  return mapGmailLabel(accountId, label);
};
