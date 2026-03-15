import EmailComponent from '@/components/EmailComponent';
import { ListSkeleton } from '@/components/skeletons';
import { prefetchSummaries } from '@/features/ai/api';
import {
  useThreads,
  useSync,
  useSyncNextPage,
  useTrashThread,
  useContactImportance,
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
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

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
    syncMutate(undefined, {
      onSuccess: () => {
        refetch();
        prefetchAbortRef.current?.abort();
        const controller = new AbortController();
        prefetchAbortRef.current = controller;
        prefetchSummaries(accountId, controller.signal).catch(() => {});
      },
    });
  }, [syncMutate, refetch, accountId]);

  const syncNextPagePendingRef = useRef(syncNextPage.isPending);
  syncNextPagePendingRef.current = syncNextPage.isPending;
  const syncNextPageMutate = syncNextPage.mutate;

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    } else if (!hasNextPage && !syncNextPagePendingRef.current) {
      syncNextPageMutate(undefined, {
        onSuccess: (result) => {
          if (result.synced_threads > 0) fetchNextPage();
        },
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, syncNextPageMutate]);

  const hasAutoSynced = useRef(false);
  useEffect(() => {
    if (!isLoading && threads.length === 0 && !hasAutoSynced.current) {
      hasAutoSynced.current = true;
      handleRefresh();
    }
  }, [isLoading, threads.length, handleRefresh]);

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
        <Text className="text-red-400">Failed to load emails</Text>
      </StyledSafeAreaView>
    );
  }

  return (
    <StyledSafeAreaView className="flex-1 bg-black p-4" edges={['top']}>
      <View className="flex-row items-center justify-between p-2">
        <Text className="text-4xl font-bold text-white">AI Mail</Text>
        <TouchableOpacity
          className="flex-row items-center"
          onPress={() => router.push('/summary')}
        >
          <Icon name="magic-wand" size={18} color="#818cf8" />
          <Text className="ml-2 font-semibold text-indigo-400">Summary</Text>
        </TouchableOpacity>
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

      <TouchableOpacity
        className="absolute right-6 bottom-10 h-16 w-16 items-center justify-center rounded-full bg-white"
        onPress={handleCompose}
      >
        <Icon name="envelope" size={24} color="black" />
      </TouchableOpacity>
    </StyledSafeAreaView>
  );
}
