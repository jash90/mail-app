import EmailComponent from '@/components/EmailComponent';
import FolderPickerModal, { getLabelDisplayName } from '@/components/FolderPickerModal';
import SearchModal from '@/components/search';
import { ListSkeleton } from '@/components/skeletons';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { useInboxScreen } from '@/features/gmail/hooks/useInboxScreen';
import { TTSPlayerBar } from '@/features/tts';
import { threadToEmailProps } from '@/lib/threadTransform';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { FlashList } from '@shopify/flash-list';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

export default function ListScreen() {
  const {
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
    handleDeleteById,
    refetch,
  } = useInboxScreen();

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
