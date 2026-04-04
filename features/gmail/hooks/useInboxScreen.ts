import { prefetchSummaries } from '@/features/ai/api';
import { acquireNetwork } from '@/features/ai/resourceLock';
import { useContactImportance } from './useSearchHooks';
import { useLabels } from './useLabelsHook';
import { useThreads } from './useThreadQueries';
import {
  useTrashThread,
  useArchiveThread,
  useMarkAsRead,
} from './useThreadMutations';
import { triggerManualSync } from '@/features/gmail/syncManager';
import { syncLabelThreads } from '@/features/gmail/sync';
import { useEmailTTSQueue } from '@/features/tts';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

export function useInboxScreen() {
  const router = useRouter();
  const [searchVisible, setSearchVisible] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('INBOX');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';

  const { data: labels } = useLabels(accountId);

  const [isSyncingLabel, setIsSyncingLabel] = useState(false);

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
              console.warn('[useInboxScreen] Label sync failed:', err);
          } finally {
            releaseNetwork();
            if (!cancelled) setIsSyncingLabel(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[useInboxScreen] Label sync failed:', err);
            setIsSyncingLabel(false);
          }
        });
    });

    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [accountId, selectedLabel, refetch]);
  const { data: importanceMap } = useContactImportance(accountId, userEmail);

  const unreadThreads = useMemo(
    () => threads.filter((t) => !t.is_read),
    [threads],
  );
  const tts = useEmailTTSQueue(unreadThreads);

  const prefetchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => prefetchAbortRef.current?.abort();
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!accountId) return;
    setSelectedIds(new Set());
    setIsRefreshing(true);
    try {
      // Acquire network lock for sync operations (waits if local AI is active)
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
      // prefetchSummaries handles its own AI lock internally
      if (selectedLabel === 'INBOX') {
        prefetchAbortRef.current?.abort();
        const controller = new AbortController();
        prefetchAbortRef.current = controller;
        prefetchSummaries(accountId, controller.signal, userEmail).catch(
          (err) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.warn('[InboxScreen] prefetchSummaries failed:', err);
          },
        );
      }
    } catch (err) {
      console.error('[InboxScreen] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, accountId, userEmail, selectedLabel]);

  const handleEndReached = useCallback(() => {
    if (!accountId) return;
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [accountId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCompose = useCallback(() => {
    analytics.emailComposed();
    router.push('/compose');
  }, [router]);

  // --- Selection mode state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedIds.size > 0;
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const trashThreadMutation = useTrashThread(accountId);
  const archiveMutation = useArchiveThread(accountId);
  const markAsReadMutation = useMarkAsRead(accountId);

  // Clear selection when switching labels
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedLabel]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleLongPress = useCallback(
    (id: string) => {
      if (isSelectionMode) {
        toggleSelection(id);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedIds(new Set([id]));
      }
    },
    [isSelectionMode, toggleSelection],
  );

  const handlePress = useCallback(
    (id: string) => {
      if (isSelectionMode) {
        toggleSelection(id);
      } else {
        router.push({ pathname: '/thread/[id]', params: { id } });
      }
    },
    [isSelectionMode, toggleSelection, router],
  );

  const batchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => {
        analytics.threadTrashed(id);
        return trashThreadMutation.mutateAsync(id);
      }),
    );
    analytics.batchTrashed(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, trashThreadMutation]);

  const batchArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map((id) => archiveMutation.mutateAsync(id)));
    analytics.batchArchived(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, archiveMutation]);

  const batchMarkAsRead = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsBatchProcessing(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => markAsReadMutation.mutateAsync(id)),
    );
    analytics.batchMarkedAsRead(ids.length);
    setSelectedIds(new Set());
    setIsBatchProcessing(false);
  }, [selectedIds, markAsReadMutation]);

  return {
    accountId,
    threads,
    isLoading,
    isError,
    isRefreshing,
    isFetchingNextPage,
    importanceMap,
    labels,
    selectedLabel,
    setSelectedLabel,
    folderPickerVisible,
    setFolderPickerVisible,
    tts,
    searchVisible,
    setSearchVisible,
    handleRefresh,
    handleEndReached,
    handleCompose,
    handlePress,
    handleLongPress,
    selectedIds,
    isSelectionMode,
    clearSelection,
    batchDelete,
    batchArchive,
    batchMarkAsRead,
    isBatchProcessing,
    isSyncingLabel,
    refetch,
  };
}
