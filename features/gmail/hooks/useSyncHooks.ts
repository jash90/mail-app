import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gmailKeys } from '../queryKeys';
import { performIncrementalSync, performFullSync, syncNextPage } from '../sync';
import { getSyncState, upsertSyncState } from '@/db/repositories/syncState';
import { rebuildFTSIndex } from '@/db/repositories/search';
import { resetFTSVerification } from '@/features/search';

/** Fetch the next page of threads from Gmail API when local data runs out. */
export const useSyncNextPage = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncNextPage(accountId),
    onSuccess: (result) => {
      upsertSyncState(accountId, result.new_sync_state);
      if (result.synced_threads > 0) {
        queryClient.invalidateQueries({
          queryKey: gmailKeys.threads(accountId),
        });
      }
    },
  });
};

/** Trigger a sync from Gmail API — data lands in SQLite. */
export const useSync = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const state = getSyncState(accountId);
      const result = state?.history_id
        ? await performIncrementalSync(accountId, state)
        : await performFullSync(accountId);
      upsertSyncState(accountId, result.new_sync_state);
      return result;
    },
    onSuccess: () => {
      rebuildFTSIndex(accountId);
      resetFTSVerification();
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
      queryClient.invalidateQueries({
        queryKey: ['contact-importance', accountId],
      });
    },
  });
};

/**
 * Check if local sync is sufficient for FTS search.
 * Returns true only when sync is fully complete (no next_page_token).
 */
export const isSyncReady = (accountId: string): boolean => {
  if (!accountId) return false;
  const state = getSyncState(accountId);
  return !!state && !state.next_page_token;
};
