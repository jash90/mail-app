import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { PhaseBanner, SummaryItemRow } from '@/components/summary';
import { db } from '@/db/client';
import { summaryCache } from '@/db/schema';
import {
  useSummaryPipeline,
  type SummaryItem,
} from '@/features/ai/hooks/useSummaryPipeline';
import { useAuthStore } from '@/store/authStore';
import { TTSService } from '@/features/tts';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

const listContentStyle = { paddingHorizontal: 16, paddingBottom: 32 } as const;

export default function SummaryScreen() {
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';
  const { items, total, phase, phaseDetail, retrySummary, clearAll } =
    useSummaryPipeline(accountId, userEmail);

  const renderItem = useCallback(
    ({ item, index }: { item: SummaryItem; index: number }) => (
      <SummaryItemRow item={item} index={index} onRetry={retrySummary} />
    ),
    [retrySummary],
  );

  const isLoading =
    phase === 'checking' || phase === 'syncing' || phase === 'selecting';

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

      <PhaseBanner phase={phase} detail={phaseDetail} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator size="large" color="#818cf8" />
          <Text className="text-base text-zinc-400">{phaseDetail}</Text>
        </View>
      ) : total === 0 && phase === 'done' ? (
        <View className="flex-1 items-center justify-center gap-2">
          <Icon name="check" size={32} color="#4ade80" />
          <Text className="text-lg text-zinc-400">
            No unread emails to summarize
          </Text>
          <Text className="px-8 text-center text-sm text-zinc-600">
            Unread inbox emails will appear here with AI summaries
          </Text>
        </View>
      ) : total === 0 && phase === 'error' ? (
        <View className="flex-1 items-center justify-center gap-2">
          <Icon name="exclamation" size={32} color="#f87171" />
          <Text className="text-lg text-zinc-400">Failed to load</Text>
          <Text className="px-8 text-center text-sm text-zinc-600">
            {phaseDetail}
          </Text>
        </View>
      ) : (
        <>
          {phase === 'summarizing' && (
            <Text className="px-4 pb-2 text-sm text-zinc-400">
              {phaseDetail}
            </Text>
          )}
          {phase === 'done' && (
            <Text className="px-4 pb-2 text-sm text-zinc-400">
              All {total} email{total !== 1 ? 's' : ''} summarized
            </Text>
          )}

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
