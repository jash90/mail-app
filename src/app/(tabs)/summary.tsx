import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import {
  PhaseBanner,
  SummaryHeader,
  SummaryItemRow,
} from '@/src/features/stats/components';
import { clearSummaryCache } from '@/src/shared/db/repositories/summaryCache';
import { useSummaryPipeline, type SummaryItem } from '@/src/features/ai';
import { getInboxUnreadCount, syncLabelThreads } from '@/src/features/gmail';
import { useAuthStore } from '@/src/shared/store/authStore';
import { TTSService } from '@/src/features/tts';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

const listContentStyle = { paddingHorizontal: 16, paddingBottom: 32 } as const;

const keyExtractor = (item: SummaryItem) => item.thread.id;

export default function SummaryScreen() {
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const userEmail = user?.email ?? '';
  const { items, total, phase, phaseDetail, retrySummary, restart, clearAll } =
    useSummaryPipeline(accountId, userEmail, {
      getInboxUnreadCount,
      syncLabelThreads,
    });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    restart();
  }, [restart]);

  const isLoading =
    phase === 'checking' || phase === 'syncing' || phase === 'selecting';

  // Clear refreshing indicator once pipeline moves past initial phases
  useEffect(() => {
    if (isRefreshing && !isLoading && phase !== 'idle') {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isLoading, phase]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      tintColor="#818cf8"
    />
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SummaryItem; index: number }) => (
      <SummaryItemRow item={item} index={index} onRetry={retrySummary} />
    ),
    [retrySummary],
  );

  const handleClearCache = useCallback(() => {
    clearSummaryCache();
    TTSService.shared().clearCache();
    clearAll();
    console.log('[DEV] Summary + TTS audio cache cleared');
  }, [clearAll]);

  const emptyComponent = isLoading ? (
    <View className="flex-1 items-center justify-center gap-4 pt-32">
      <ActivityIndicator size="large" color="#818cf8" />
      <Text className="text-base text-zinc-400">{phaseDetail}</Text>
    </View>
  ) : phase === 'error' ? (
    <View className="flex-1 items-center justify-center gap-2 pt-32">
      <Icon name="exclamation" size={32} color="#f87171" />
      <Text className="text-lg text-zinc-400">Failed to load</Text>
      <Text className="px-8 text-center text-sm text-zinc-600">
        {phaseDetail}
      </Text>
    </View>
  ) : phase === 'done' ? (
    <View className="flex-1 items-center justify-center gap-2 pt-32">
      <Icon name="check" size={32} color="#4ade80" />
      <Text className="text-lg text-zinc-400">
        No unread emails to summarize
      </Text>
      <Text className="px-8 text-center text-sm text-zinc-600">
        Unread inbox emails will appear here with AI summaries
      </Text>
    </View>
  ) : null;

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <SummaryHeader onClear={handleClearCache} />
      <PhaseBanner phase={phase} detail={phaseDetail} />
      <FlashList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={total === 0 ? { flex: 1 } : listContentStyle}
        refreshControl={refreshControl}
        removeClippedSubviews
      />
    </StyledSafeAreaView>
  );
}
