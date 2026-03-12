import { gmailRequest } from './api';

const safeModify = async (
  label: string,
  fn: () => Promise<unknown>,
): Promise<boolean> => {
  try {
    await fn();
    return true;
  } catch (error) {
    console.error(label, { error });
    return false;
  }
};

export const markAsRead = (threadId: string) =>
  safeModify(`Failed to mark thread ${threadId} as read`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    }));

export const markAsUnread = (threadId: string) =>
  safeModify(`Failed to mark thread ${threadId} as unread`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
    }));

export const toggleStar = (messageId: string, starred: boolean) =>
  safeModify(`Failed to toggle star for message ${messageId}`, () =>
    gmailRequest(`/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify(
        starred
          ? { addLabelIds: ['STARRED'] }
          : { removeLabelIds: ['STARRED'] },
      ),
    }));

export const archiveThread = (threadId: string) =>
  safeModify(`Failed to archive thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    }));

export const trashThread = (threadId: string) =>
  safeModify(`Failed to trash thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/trash`, { method: 'POST' }));

export const untrashThread = (threadId: string) =>
  safeModify(`Failed to untrash thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/untrash`, { method: 'POST' }));

export const deleteThread = (threadId: string) =>
  safeModify(`Failed to delete thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}`, { method: 'DELETE' }));
