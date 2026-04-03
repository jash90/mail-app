import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { db } from '@/db/client';
import { summaryCache } from '@/db/schema';
import {
  useSummaryPipeline,
  type SummaryItem,
} from '@/features/ai/hooks/useSummaryPipeline';
import { useAuthStore } from '@/store/authStore';
import { TTSService } from '@/features/tts';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

const listContentStyle = { paddingHorizontal: 16, paddingBottom: 32 } as const;

const SummaryItemRow = memo(function SummaryItemRow({
  item,
  index,
  onRetry,
}: {
  item: SummaryItem;
  index: number;
  onRetry: (index: number, item: SummaryItem) => void;
}) {
  return (
    <View className="mb-3 rounded-xl bg-zinc-900 p-4">
      <Text className="text-sm font-semibold text-indigo-400" numberOfLines={1}>
        {item.thread.participants[0]?.name ||
          item.thread.participants[0]?.email ||
          'Unknown'}
      </Text>
      <Text className="mt-1 text-base font-medium text-white" numberOfLines={2}>
        {item.thread.subject}
      </Text>

      {item.loading ? (
        <ActivityIndicator
          className="mt-3 self-start"
          size="small"
          color="#818cf8"
        />
      ) : item.error ? (
        <View className="mt-2 flex-row items-center gap-3">
          <Text className="flex-1 text-sm text-red-400">
            Error: {item.error}
          </Text>
          <Pressable
            onPress={() => onRetry(index, item)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-white">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-zinc-300">
          {item.summary}
        </Text>
      )}
    </View>
  );
});

export default function SummaryScreen() {
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';
  const { items, processed, total, retrySummary, clearAll } =
    useSummaryPipeline(accountId, userEmail);

  const renderItem = useCallback(
    ({ item, index }: { item: SummaryItem; index: number }) => (
      <SummaryItemRow item={item} index={index} onRetry={retrySummary} />
    ),
    [retrySummary],
  );

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <View className="flex-row items-center gap-4 p-4">
        <Text className="flex-1 text-2xl font-bold text-white">AI Summary</Text>
        {__DEV__ && (
          <Pressable
            onPress={() => {
              db.delete(summaryCache).run();
              TTSService.shared().clearCache();
              clearAll();
              console.log('[DEV] Summary + TTS audio cache cleared');
            }}
          >
            <Icon name="trash" size={18} color="#f87171" />
          </Pressable>
        )}
      </View>

      {total === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg text-zinc-400">No unread emails</Text>
        </View>
      ) : (
        <>
          <Text className="px-4 pb-2 text-sm text-zinc-400">
            {processed < total
              ? `Summarizing ${processed + 1} of ${total}...`
              : `All ${total} emails summarized`}
          </Text>

          <FlatList
            data={items}
            keyExtractor={(item) => item.thread.id}
            contentContainerStyle={listContentStyle}
            renderItem={renderItem}
          />
        </>
      )}
    </StyledSafeAreaView>
  );
}
