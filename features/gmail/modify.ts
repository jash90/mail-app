import { gmailRequest } from './api';
import { updateThreadFlags } from '@/db/repositories/threads';
import { TTSService } from '@/features/tts';

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

export const markAsRead = async (threadId: string) => {
  const ok = await safeModify(`Failed to mark thread ${threadId} as read`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    }));
  if (ok) {
    try { updateThreadFlags(threadId, { is_read: true }); } catch { /* */ }
    TTSService.shared().deleteEmailAudio(threadId).catch(() => {});
  }
  return ok;
};

export const markAsUnread = async (threadId: string) => {
  const ok = await safeModify(`Failed to mark thread ${threadId} as unread`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
    }));
  if (ok) try { updateThreadFlags(threadId, { is_read: false }); } catch { /* */ }
  return ok;
};

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

export const archiveThread = async (threadId: string) => {
  const ok = await safeModify(`Failed to archive thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    }));
  if (ok) try { updateThreadFlags(threadId, { is_archived: true }); } catch { /* */ }
  return ok;
};

export const trashThread = async (threadId: string) => {
  const ok = await safeModify(`Failed to trash thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/trash`, { method: 'POST' }));
  if (ok) {
    try { updateThreadFlags(threadId, { is_trashed: true }); } catch { /* */ }
    TTSService.shared().deleteEmailAudio(threadId).catch(() => {});
  }
  return ok;
};

export const untrashThread = (threadId: string) =>
  safeModify(`Failed to untrash thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}/untrash`, { method: 'POST' }));

export const deleteThread = (threadId: string) =>
  safeModify(`Failed to delete thread ${threadId}`, () =>
    gmailRequest(`/threads/${threadId}`, { method: 'DELETE' }));
