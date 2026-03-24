import EmailComponent from '@/components/EmailComponent';
import { ListSkeleton } from '@/components/skeletons';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { prefetchSummaries } from '@/features/ai/api';
import {
  useContactImportance,
  useSync,
  useSyncNextPage,
  useThreads,
  useTrashThread,
} from '@/features/gmail';
import { TTSPlayerBar, useEmailTTSQueue } from '@/features/tts';
import { threadToEmailProps } from '@/lib/threadTransform';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

export default function ListScreen() {
  const router = useRouter();
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

  const sync = useSync(accountId);
  const syncNextPage = useSyncNextPage(accountId);
  const isRefreshing = sync.isPending;

  const prefetchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => prefetchAbortRef.current?.abort();
  }, []);

  const syncMutate = sync.mutate;
  const handleRefresh = useCallback(() => {
    if (!accountId) return;
    syncMutate(undefined, {
      onSuccess: () => {
        refetch();
        prefetchAbortRef.current?.abort();
        const controller = new AbortController();
        prefetchAbortRef.current = controller;
        prefetchSummaries(accountId, controller.signal).catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.warn('[ListScreen] prefetchSummaries failed:', err);
        });
      },
      onError: (err) => {
        console.error('[ListScreen] Sync failed:', err);
      },
    });
  }, [syncMutate, refetch, accountId]);

  const syncNextPagePendingRef = useRef(syncNextPage.isPending);
  syncNextPagePendingRef.current = syncNextPage.isPending;
  const syncNextPageMutate = syncNextPage.mutate;

  const handleEndReached = useCallback(() => {
    if (!accountId) return;
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    } else if (!hasNextPage && !syncNextPagePendingRef.current) {
      syncNextPageMutate(undefined, {
        onSuccess: (result) => {
          if (result.synced_threads > 0) fetchNextPage();
        },
      });
    }
  }, [
    accountId,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    syncNextPageMutate,
  ]);

  const didInitialSync = useRef(false);

  useEffect(() => {
    didInitialSync.current = false;
  }, [accountId]);

  useEffect(() => {
    if (!accountId || didInitialSync.current || sync.isPending) return;
    didInitialSync.current = true;
    handleRefresh();
  }, [accountId, handleRefresh, sync.isPending]);

  const handleCompose = () => {
    router.push('/compose');
  };

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
          onPress: () => trashMutate(thread.id),
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

  const renderItem = useCallback(
    ({ item }: { item: EmailThread }) => (
      <EmailComponent
        id={item.id}
        item={threadToEmailProps(item, importanceMap)}
        onPress={handleThread}
        onLongPress={handleDeleteById}
      />
    ),
    [importanceMap, handleThread, handleDeleteById],
  );

  if (isError) {
    return (
      <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
        <Text className="mb-4 text-red-400">Failed to load emails</Text>
        <Pressable
          className="rounded-full bg-white/10 px-6 py-3"
          onPress={() => {
            didInitialSync.current = false;
            refetch();
            handleRefresh();
          }}
        >
          <Text className="font-semibold text-white">Try again</Text>
        </Pressable>
      </StyledSafeAreaView>
    );
  }

  return (
    <StyledSafeAreaView className="flex-1 bg-black p-4" edges={['top']}>
      <View className="flex-row items-center justify-between p-2">
        <Text className="text-4xl font-bold text-white">AI Mail</Text>
        <Pressable
          className="flex-row items-center"
          onPress={() => router.push('/summary')}
        >
          <Icon name="magic-wand" size={18} color="#818cf8" />
        </Pressable>
      </View>

      <TTSPlayerBar
        state={tts.state}
        play={tts.play}
        pause={tts.pause}
        resume={tts.resume}
        stop={tts.stop}
        next={tts.next}
        prev={tts.prev}
      />

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <FlashList
          data={threads}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="white"
              colors={['white']}
            />
          }
          renderItem={renderItem}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage || syncNextPage.isPending ? (
              <View className="py-4">
                <ActivityIndicator color="white" />
              </View>
            ) : null
          }
        />
      )}

      <Pressable
        className="absolute right-6 bottom-5 h-16 w-16 items-center justify-center rounded-full bg-white"
        onPress={handleCompose}
      >
        <Icon name="envelope" size={24} color="black" />
      </Pressable>
    </StyledSafeAreaView>
  );
}
