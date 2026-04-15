import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gmailKeys } from '../services/queryKeys';
import {
  performIncrementalSync,
  performFullSync,
  syncNextPage,
} from '../services/sync';
import {
  getSyncState,
  upsertSyncState,
} from '@/src/shared/db/repositories/syncState';
import { rebuildFTSIndex } from '@/src/shared/db/repositories/search';

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

/**
 * Factory for the sync hook. Accepts an optional callback invoked after
 * FTS index rebuild — injects the search-feature's `resetFTSVerification`
 * without creating a cross-feature import.
 */
export function createUseSync(onFtsRebuilt?: () => void) {
  return (accountId: string) => {
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
        onFtsRebuilt?.();
        queryClient.invalidateQueries({
          queryKey: gmailKeys.threads(accountId),
        });
        queryClient.invalidateQueries({
          queryKey: ['contact-importance', accountId],
        });
      },
    });
  };
}

/** Default sync hook (no FTS callback). Prefer wiring via `createUseSync` at the app layer. */
export const useSync = createUseSync();

/**
 * Check if local sync is sufficient for FTS search.
 * Returns true only when sync is fully complete (no next_page_token).
 */
export const isSyncReady = (accountId: string): boolean => {
  if (!accountId) return false;
  const state = getSyncState(accountId);
  return !!state && !state.next_page_token;
};
