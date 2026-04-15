import {
  prefetchSummaries,
  getSummaryCache,
  getSummaryCacheBatch,
  summarizeEmail,
} from '@/src/features/ai';
import { fixTextEncoding } from '@/src/features/gmail';
import EmailComponent from '@/src/features/gmail/components/EmailComponent';
import FolderPickerModal from '@/src/features/gmail/components/FolderPickerModal';
import SelectionActionBar from '@/src/features/gmail/components/SelectionActionBar';
import { useInboxData } from '@/src/features/gmail/hooks/useInboxData';
import { useThreadSelection } from '@/src/features/gmail/hooks/useThreadSelection';
import { SearchModal } from '@/src/features/search/components';
import { useContactImportance } from '@/src/features/stats';
import { useEmailTTSQueue, TTSPlayerBar } from '@/src/features/tts';
import { ListSkeleton } from '@/src/shared/components/skeletons';
import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import { getLabelDisplayName } from '@/src/shared/services/labelUtils';
import { analytics } from '@/src/shared/services/analytics';
import { threadToEmailProps } from '@/src/shared/services/threadTransform';
import { useAuthStore } from '@/src/shared/store/authStore';
import type { EmailThread } from '@/src/shared/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
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

  const [searchVisible, setSearchVisible] = useState(false);

  const inbox = useInboxData(accountId);
  const selection = useThreadSelection(accountId, inbox.selectedLabel);

  const { data: importanceMap } = useContactImportance(accountId, userEmail);

  const unreadThreads = useMemo(
    () => inbox.threads.filter((t) => !t.is_read),
    [inbox.threads],
  );

  const tts = useEmailTTSQueue(unreadThreads, {
    fixTextEncoding,
    getSummaryCache,
    getSummaryCacheBatch,
    summarizeEmail,
  });

  const prefetchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => prefetchAbortRef.current?.abort();
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!accountId) return;
    selection.clearSelection();
    await inbox.handleRefresh();
    if (inbox.selectedLabel === 'INBOX') {
      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;
      prefetchSummaries(accountId, controller.signal, userEmail).catch(
        (err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.warn('[ListScreen] prefetchSummaries failed:', err);
        },
      );
    }
  }, [accountId, userEmail, inbox, selection]);

  const handlePress = useCallback(
    (id: string) => {
      if (selection.isSelectionMode) {
        selection.toggleSelection(id);
      } else {
        router.push({ pathname: '/thread/[id]', params: { id } });
      }
    },
    [selection, router],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      selection.handleLongPress(id);
    },
    [selection],
  );

  const handleCompose = useCallback(() => {
    analytics.emailComposed();
    router.push('/compose');
  }, [router]);

  const {
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
    handleEndReached,
    refetch,
  } = inbox;

  const {
    selectedIds,
    isSelectionMode,
    clearSelection,
    batchDelete,
    batchArchive,
    batchMarkAsRead,
    isBatchProcessing,
  } = selection;

  const renderItem = useCallback(
    ({ item }: { item: EmailThread }) => (
      <EmailComponent
        id={item.id}
        item={threadToEmailProps(item, importanceMap)}
        onPress={handlePress}
        onLongPress={handleLongPress}
        isSelected={selectedIds.has(item.id)}
        isSelectionMode={isSelectionMode}
      />
    ),
    [importanceMap, handlePress, handleLongPress, selectedIds, isSelectionMode],
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
        <Pressable
          onPress={() => setFolderPickerVisible(true)}
          className="flex-row items-center gap-2"
        >
          <Icon name="folder" size={20} color="#818cf8" />
          <Text className="text-4xl font-bold text-white">
            {getLabelDisplayName(selectedLabel, labels)}
          </Text>
          <Icon name="arrow-down" size={12} color="#a1a1aa" />
        </Pressable>
        <Pressable onPress={() => setSearchVisible(true)} hitSlop={8}>
          <Icon name="magnifier" size={18} color="#818cf8" />
        </Pressable>
      </View>

      <FolderPickerModal
        visible={folderPickerVisible}
        onClose={() => setFolderPickerVisible(false)}
        labels={labels ?? []}
        selectedLabel={selectedLabel}
        onSelect={setSelectedLabel}
      />

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

      {isLoading || (isSyncingLabel && threads.length === 0) ? (
        <ListSkeleton />
      ) : (
        <FlashList
          data={threads}
          keyExtractor={(item) => item.id}
          extraData={selectedIds}
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

      {isSelectionMode ? (
        <SelectionActionBar
          count={selectedIds.size}
          isProcessing={isBatchProcessing}
          onDelete={batchDelete}
          onArchive={batchArchive}
          onMarkAsRead={batchMarkAsRead}
          onCancel={clearSelection}
        />
      ) : (
        <Pressable
          className="absolute right-6 bottom-5 h-16 w-16 items-center justify-center rounded-full bg-white"
          onPress={handleCompose}
        >
          <Icon name="envelope" size={24} color="black" />
        </Pressable>
      )}
    </StyledSafeAreaView>
  );
}
