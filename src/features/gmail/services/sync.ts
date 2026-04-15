import type { SyncState, SyncResult } from '@/src/shared/types';
import type { GmailHistoryEvent } from '../types';
import { gmailRequest } from './api';
import { getLabels } from './labels';
import { listThreads, batchGetThreads } from '../threads';
import {
  getSyncState,
  upsertSyncState,
} from '@/src/shared/db/repositories/syncState';
import { SyncError } from '@/src/shared/services/errors';

const handleSyncError = (
  result: SyncResult,
  error: unknown,
  fallbackMessage: string,
  code: ConstructorParameters<typeof SyncError>[0] = 'API_ERROR',
): SyncResult => {
  const syncErr =
    error instanceof SyncError
      ? error
      : new SyncError(
          code,
          error instanceof Error ? error.message : fallbackMessage,
          error,
        );
  result.success = false;
  result.errors.push(syncErr.message);
  result.new_sync_state.status = 'error';
  result.new_sync_state.error_message = syncErr.message;
  return result;
};

export const performIncrementalSync = async (
  accountId: string,
  syncState: SyncState,
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    synced_threads: 0,
    synced_messages: 0,
    errors: [],
    new_sync_state: { ...syncState, status: 'idle' },
  };

  try {
    if (!syncState.history_id) {
      return performFullSync(accountId);
    }

    const response = await gmailRequest<{
      history?: GmailHistoryEvent[];
      historyId: string;
      nextPageToken?: string;
    }>(`/history?startHistoryId=${syncState.history_id}`);

    result.new_sync_state.history_id = response.historyId;
    result.new_sync_state.last_synced_at = new Date().toISOString();

    if (response.history) {
      const changedThreadIds = new Set<string>();

      for (const event of response.history) {
        event.messagesAdded?.forEach((m) => {
          changedThreadIds.add(m.message.threadId);
          result.synced_messages++;
        });
        event.messagesDeleted?.forEach((m) =>
          changedThreadIds.add(m.message.threadId),
        );
        event.labelsAdded?.forEach((m) =>
          changedThreadIds.add(m.message.threadId),
        );
        event.labelsRemoved?.forEach((m) =>
          changedThreadIds.add(m.message.threadId),
        );
      }

      if (changedThreadIds.size > 0) {
        const threads = await batchGetThreads(accountId, [...changedThreadIds]);
        result.synced_threads = threads.length;
      }
    }

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Start history id too old')
    ) {
      return performFullSync(accountId);
    }

    return handleSyncError(result, error, 'Sync failed', 'API_ERROR');
  }
};

export const performFullSync = async (
  accountId: string,
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    synced_threads: 0,
    synced_messages: 0,
    errors: [],
    new_sync_state: {
      status: 'idle',
      last_synced_at: new Date().toISOString(),
    },
  };

  try {
    try {
      await getLabels(accountId);
    } catch {
      /* non-blocking */
    }

    const { threads, nextPageToken } = await listThreads(accountId, ['INBOX']);
    result.synced_threads = threads.length;
    result.new_sync_state.next_page_token = nextPageToken;

    const profile = await gmailRequest<{ historyId: string }>('/profile');
    result.new_sync_state.history_id = profile.historyId;

    return result;
  } catch (error) {
    return handleSyncError(result, error, 'Full sync failed');
  }
};

/** Fetch threads for a specific label from Gmail API and store in SQLite. */
export const syncLabelThreads = async (
  accountId: string,
  labelIds: string[],
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    synced_threads: 0,
    synced_messages: 0,
    errors: [],
    new_sync_state: {
      status: 'idle',
      last_synced_at: new Date().toISOString(),
    },
  };

  try {
    const { threads } = await listThreads(accountId, labelIds);
    result.synced_threads = threads.length;
    return result;
  } catch (error) {
    return handleSyncError(
      result,
      error,
      `Sync for labels ${labelIds.join(',')} failed`,
    );
  }
};

/** Fetch the next page of threads from Gmail API using the saved nextPageToken. */
export const syncNextPage = async (accountId: string): Promise<SyncResult> => {
  const state = getSyncState(accountId);
  const result: SyncResult = {
    success: true,
    synced_threads: 0,
    synced_messages: 0,
    errors: [],
    new_sync_state: {
      status: 'idle',
      history_id: state?.history_id,
      last_synced_at: state?.last_synced_at,
    },
  };

  if (!state?.next_page_token) {
    return result;
  }

  try {
    const { threads, nextPageToken } = await listThreads(accountId, ['INBOX'], {
      cursor: state.next_page_token,
    });

    result.synced_threads = threads.length;
    result.new_sync_state.next_page_token = nextPageToken;

    return result;
  } catch (error) {
    return handleSyncError(result, error, 'Next page sync failed');
  }
};
