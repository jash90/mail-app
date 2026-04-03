import { prefetchSummaries } from '@/features/ai/api';
import { useContactImportance } from './useSearchHooks';
import { useThreads } from './useThreadQueries';
import { useTrashThread } from './useThreadMutations';
import { triggerManualSync } from '@/features/gmail/syncManager';
import { useEmailTTSQueue } from '@/features/tts';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

export function useInboxScreen() {
  const router = useRouter();
  const [searchVisible, setSearchVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreads(accountId, ['INBOX']);

  const threads = useMemo(
    () => data?.pages.flatMap((page) => page) ?? [],
    [data],
  );
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
      await triggerManualSync();
      await refetch();
      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;
      prefetchSummaries(accountId, controller.signal).catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn('[InboxScreen] prefetchSummaries failed:', err);
      });
    } catch (err) {
      console.error('[InboxScreen] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, accountId]);

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
    tts,
    searchVisible,
    setSearchVisible,
    handleRefresh,
    handleEndReached,
    handleCompose,
    handleThread,
    handleDelete,
    handleDeleteById,
    refetch,
  };
}
