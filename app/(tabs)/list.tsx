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
import { threadToEmailProps } from '@/lib/threadTransform';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

  const autoSyncAttempts = useRef(0);
  const MAX_AUTO_SYNC_ATTEMPTS = 3;
  useEffect(() => {
    if (!accountId) return;
    if (
      !isLoading &&
      threads.length === 0 &&
      autoSyncAttempts.current < MAX_AUTO_SYNC_ATTEMPTS &&
      !sync.isPending
    ) {
      autoSyncAttempts.current += 1;
      handleRefresh();
    }
  }, [accountId, isLoading, threads.length, handleRefresh, sync.isPending]);

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

  const renderItem = useCallback(
    ({ item }: { item: EmailThread }) => (
      <EmailComponent
        item={threadToEmailProps(item, importanceMap)}
        onPress={() => handleThread(item.id)}
        onLongPress={() => handleDelete(item)}
      />
    ),
    [importanceMap, handleThread, handleDelete],
  );

  if (isError) {
    return (
      <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
        <Text className="mb-4 text-red-400">Failed to load emails</Text>
        <Pressable
          className="rounded-full bg-white/10 px-6 py-3"
          onPress={() => {
            autoSyncAttempts.current = 0;
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
          {/* <Text className="ml-2 font-semibold text-indigo-400">Summary</Text> */}
        </Pressable>
      </View>

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <FlatList
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
        className="absolute right-6 bottom-10 h-16 w-16 items-center justify-center rounded-full bg-white"
        onPress={handleCompose}
      >
        <Icon name="envelope" size={24} color="black" />
      </Pressable>
    </StyledSafeAreaView>
  );
}
