import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import { DismissableErrorBoundary } from '@/src/shared/components/DismissableErrorBoundary';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import {
  TotalCard,
  ProviderSection,
  OperationSection,
  DailyChart,
  RecentList,
  formatNumber,
} from '@/src/features/ai/components';

import { useAITokenStats } from '@/src/features/ai';

export { DismissableErrorBoundary as ErrorBoundary };

export default function AITokensScreen() {
  const router = useRouter();
  const { stats, reset } = useAITokenStats();

  const handleReset = useCallback(() => {
    Alert.alert(
      'Clear Token Stats',
      'This will permanently delete all AI token usage history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: reset },
      ],
    );
  }, [reset]);

  const isEmpty = stats.totals.requestCount === 0;

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <ScrollView className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-2 pb-3">
          <View className="flex-row items-center gap-3">
            <Pressable onPress={router.back} hitSlop={8}>
              <Icon name="arrow-left" size={20} color="white" />
            </Pressable>
            <Text className="text-3xl font-bold text-white">AI Tokens</Text>
          </View>
          {!isEmpty && (
            <Pressable
              className="rounded-lg bg-zinc-800 px-3 py-1.5"
              onPress={handleReset}
            >
              <Text className="text-xs text-red-400">Clear</Text>
            </Pressable>
          )}
        </View>

        {isEmpty ? (
          <View className="items-center py-16">
            <Icon name="energy" size={40} color="#3f3f46" />
            <Text className="mt-4 text-base text-zinc-500">
              No AI usage recorded yet
            </Text>
            <Text className="mt-1 text-xs text-zinc-600">
              Token stats will appear here after AI calls
            </Text>
          </View>
        ) : (
          <>
            {/* Totals */}
            <View className="flex-row gap-2">
              <TotalCard
                icon="energy"
                value={formatNumber(stats.totals.totalTokens)}
                label="Total tokens"
              />
              <TotalCard
                icon="arrow-up"
                value={formatNumber(stats.totals.totalPromptTokens)}
                label="Prompt"
              />
              <TotalCard
                icon="arrow-down"
                value={formatNumber(stats.totals.totalCompletionTokens)}
                label="Completion"
              />
              <TotalCard
                icon="loop"
                value={String(stats.totals.requestCount)}
                label="Requests"
              />
            </View>

            <OperationSection data={stats.byOperation} />
            <ProviderSection data={stats.byProvider} />
            <DailyChart data={stats.byDay} />
            <RecentList data={stats.recent} />
          </>
        )}
      </ScrollView>
    </StyledSafeAreaView>
  );
}
