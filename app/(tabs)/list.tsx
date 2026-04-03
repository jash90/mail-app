import EmailComponent from '@/components/EmailComponent';
import SearchModal from '@/components/search';
import { ListSkeleton } from '@/components/skeletons';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { prefetchSummaries } from '@/features/ai/api';
import {
  useContactImportance,
  useThreads,
  useTrashThread,
} from '@/features/gmail';
import { triggerManualSync } from '@/features/gmail/syncManager';
import { TTSPlayerBar, useEmailTTSQueue } from '@/features/tts';
import { analytics } from '@/lib/analytics';
import { threadToEmailProps } from '@/lib/threadTransform';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
        console.warn('[ListScreen] prefetchSummaries failed:', err);
      });
    } catch (err) {
      console.error('[ListScreen] Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, accountId]);

  const handleEndReached = useCallback(() => {
    if (!accountId) return;
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
    // SyncManager handles pagination automatically — no need to trigger here
  }, [accountId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCompose = () => {
    analytics.emailComposed();
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
        <View className="flex-row items-center gap-5">
          <Pressable onPress={() => setSearchVisible(true)} hitSlop={8}>
            <Icon name="magnifier" size={18} color="#818cf8" />
          </Pressable>
          <Pressable onPress={() => router.push('/summary')}>
            <Icon name="magic-wand" size={18} color="#818cf8" />
          </Pressable>
        </View>
      </View>

      <SearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        accountId={accountId}
        importanceMap={importanceMap}
      />

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
            isFetchingNextPage ? (
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
