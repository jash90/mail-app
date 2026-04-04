import { prefetchSummaries } from '@/features/ai/api';
import { acquireNetwork } from '@/features/ai/resourceLock';
import { useContactImportance } from './useSearchHooks';
import { useLabels } from './useLabelsHook';
import { useThreads } from './useThreadQueries';
import { useTrashThread } from './useThreadMutations';
import { triggerManualSync } from '@/features/gmail/syncManager';
import { syncLabelThreads } from '@/features/gmail/sync';
import { useEmailTTSQueue } from '@/features/tts';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';

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

  const trashThreadMutation = useTrashThread(accountId);
  const trashMutate = trashThreadMutation.mutate;

  const handleDelete = useCallback(
    (thread: EmailThread) => {
      const sender =
        thread.participants[0]?.name ??
        thread.participants[0]?.email ??
        'Unknown';
      Alert.alert('Delete message', `From: ${sender}\n${thread.subject}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            analytics.threadTrashed(thread.id);
            trashMutate(thread.id);
          },
        },
      ]);
    },
    [trashMutate],
  );

  const handleThread = useCallback(
    (id: string) => router.push({ pathname: '/thread/[id]', params: { id } }),
    [router],
  );

  const handleDeleteById = useCallback(
    (id: string) => {
      const thread = threads.find((t) => t.id === id);
      if (thread) handleDelete(thread);
    },
    [threads, handleDelete],
  );

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
    handleThread,
    handleDelete,
    handleDeleteById,
    isSyncingLabel,
    refetch,
  };
}
