import { gmailRequest } from './api';
import { updateThreadFlags } from '@/db/repositories/threads';
import { recordAction } from '@/db/repositories/userActions';
import { TTSService } from '@/features/tts';
import { threadEvents } from '@/lib/threadEvents';

/** Extract Gmail provider ID from internal ID ("accountId_providerThreadId" → "providerThreadId"). */
const toProviderId = (internalId: string): string => {
  const idx = internalId.lastIndexOf('_');
  return idx >= 0 ? internalId.slice(idx + 1) : internalId;
};

/** Extract accountId from internal ID ("accountId_providerThreadId" → "accountId"). */
const toAccountId = (internalId: string): string => {
  const idx = internalId.lastIndexOf('_');
  return idx >= 0 ? internalId.slice(0, idx) : '';
};

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
  const providerId = toProviderId(threadId);
  const ok = await safeModify(`Failed to mark thread ${threadId} as read`, () =>
    gmailRequest(`/threads/${providerId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    }),
  );
  if (ok) {
    try {
      updateThreadFlags(threadId, { is_read: true });
    } catch {
      /* */
    }
    TTSService.shared()
      .deleteEmailAudio(threadId)
      .catch(() => {});
    threadEvents.emitRemoved(threadId);
  }
  return ok;
};

export const markAsUnread = async (threadId: string) => {
  const providerId = toProviderId(threadId);
  const ok = await safeModify(
    `Failed to mark thread ${threadId} as unread`,
    () =>
      gmailRequest(`/threads/${providerId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
      }),
  );
  if (ok)
    try {
      updateThreadFlags(threadId, { is_read: false });
    } catch {
      /* */
    }
  return ok;
};

export const toggleStar = (messageId: string, starred: boolean) => {
  const providerId = toProviderId(messageId);
  return safeModify(`Failed to toggle star for message ${messageId}`, () =>
    gmailRequest(`/messages/${providerId}/modify`, {
      method: 'POST',
      body: JSON.stringify(
        starred
          ? { addLabelIds: ['STARRED'] }
          : { removeLabelIds: ['STARRED'] },
      ),
    }),
  );
};

export const archiveThread = async (threadId: string) => {
  const providerId = toProviderId(threadId);
  const ok = await safeModify(`Failed to archive thread ${threadId}`, () =>
    gmailRequest(`/threads/${providerId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    }),
  );
  if (ok) {
    try {
      updateThreadFlags(threadId, { is_archived: true });
    } catch {
      /* */
    }
    const acct = toAccountId(threadId);
    if (acct) recordAction(acct, threadId, 'archive');
    threadEvents.emitRemoved(threadId);
  }
  return ok;
};

export const trashThread = async (threadId: string) => {
  const providerId = toProviderId(threadId);
  const ok = await safeModify(`Failed to trash thread ${threadId}`, () =>
    gmailRequest(`/threads/${providerId}/trash`, { method: 'POST' }),
  );
  if (ok) {
    try {
      updateThreadFlags(threadId, { is_trashed: true });
    } catch {
      /* */
    }
    const acct = toAccountId(threadId);
    if (acct) recordAction(acct, threadId, 'trash');
    TTSService.shared()
      .deleteEmailAudio(threadId)
      .catch(() => {});
    threadEvents.emitRemoved(threadId);
  }
  return ok;
};

export const untrashThread = async (threadId: string) => {
  const providerId = toProviderId(threadId);
  const ok = await safeModify(`Failed to untrash thread ${threadId}`, () =>
    gmailRequest(`/threads/${providerId}/untrash`, { method: 'POST' }),
  );
  if (ok) {
    try {
      updateThreadFlags(threadId, { is_trashed: false });
    } catch {
      /* */
    }
  }
  return ok;
};

export const deleteThread = (threadId: string) => {
  const providerId = toProviderId(threadId);
  return safeModify(`Failed to delete thread ${threadId}`, () =>
    gmailRequest(`/threads/${providerId}`, { method: 'DELETE' }),
  );
};
