import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import {
  PhaseBanner,
  SummaryHeader,
  SummaryItemRow,
} from '@/components/summary';
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
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

const listContentStyle = { paddingHorizontal: 16, paddingBottom: 32 } as const;

const keyExtractor = (item: SummaryItem) => item.thread.id;

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

  const handleClearCache = useCallback(() => {
    db.delete(summaryCache).run();
    TTSService.shared().clearCache();
    clearAll();
    console.log('[DEV] Summary + TTS audio cache cleared');
  }, [clearAll]);

  const isLoading =
    phase === 'checking' || phase === 'syncing' || phase === 'selecting';

  if (isLoading) {
    return (
      <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
        <SummaryHeader onClear={handleClearCache} />
        <PhaseBanner phase={phase} detail={phaseDetail} />
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator size="large" color="#818cf8" />
          <Text className="text-base text-zinc-400">{phaseDetail}</Text>
        </View>
      </StyledSafeAreaView>
    );
  }

  if (total === 0 && (phase === 'done' || phase === 'error')) {
    const isDone = phase === 'done';
    return (
      <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
        <SummaryHeader onClear={handleClearCache} />
        <View className="flex-1 items-center justify-center gap-2">
          <Icon
            name={isDone ? 'check' : 'exclamation'}
            size={32}
            color={isDone ? '#4ade80' : '#f87171'}
          />
          <Text className="text-lg text-zinc-400">
            {isDone ? 'No unread emails to summarize' : 'Failed to load'}
          </Text>
          <Text className="px-8 text-center text-sm text-zinc-600">
            {isDone
              ? 'Unread inbox emails will appear here with AI summaries'
              : phaseDetail}
          </Text>
        </View>
      </StyledSafeAreaView>
    );
  }

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <SummaryHeader onClear={handleClearCache} />
      <PhaseBanner phase={phase} detail={phaseDetail} />
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        initialNumToRender={10}
        removeClippedSubviews
      />
    </StyledSafeAreaView>
  );
}
