import { acquireNetwork } from '@/src/shared/services/resourceLock';
import { useLabels } from './useLabelsHook';
import { useThreads } from './useThreadQueries';
import { triggerManualSync } from '../services/syncManager';
import { syncLabelThreads } from '../services/sync';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

export function useInboxData(accountId: string) {
  const [selectedLabel, setSelectedLabel] = useState('INBOX');
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingLabel, setIsSyncingLabel] = useState(false);

  const { data: labels } = useLabels(accountId);

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreads(accountId, [selectedLabel]);

  const threads = useMemo(
    () => data?.pages.flatMap((page) => page) ?? [],
    [data],
  );

  // Fetch threads from Gmail API when the user switches labels
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    const handle = InteractionManager.runAfterInteractions(() => {
      setIsSyncingLabel(true);
      acquireNetwork()
        .then(async (releaseNetwork) => {
          try {
            await syncLabelThreads(accountId, [selectedLabel]);
            if (!cancelled) refetch();
          } catch (err) {
            if (!cancelled)
              console.warn('[useInboxData] Label sync failed:', err);
          } finally {
            releaseNetwork();
            if (!cancelled) setIsSyncingLabel(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[useInboxData] Label sync failed:', err);
            setIsSyncingLabel(false);
          }
        });
    });

    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [accountId, selectedLabel, refetch]);

  const handleRefresh = useCallback(async () => {
    if (!accountId) return;
    setIsRefreshing(true);
    try {
      const releaseNetwork = await acquireNetwork();
      try {
        await syncLabelThreads(accountId, [selectedLabel]);
        if (selectedLabel === 'INBOX') {
          await triggerManualSync();
        }
      } finally {
        releaseNetwork();
      }
      await refetch();
    } catch (err) {
      console.error('[useInboxData] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, accountId, selectedLabel]);

  const handleEndReached = useCallback(() => {
    if (!accountId) return;
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [accountId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    threads,
    isLoading,
    isError,
    isRefreshing,
    isFetchingNextPage,
    isSyncingLabel,
    labels,
    selectedLabel,
    setSelectedLabel,
    folderPickerVisible,
    setFolderPickerVisible,
    handleRefresh,
    handleEndReached,
    refetch,
  };
}
