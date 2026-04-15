import type { SummaryItem } from '@/src/features/ai/hooks/useSummaryPipeline';
import { getSenderDisplayName } from '@/src/shared/services/participantUtils';
import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface SummaryItemRowProps {
  item: SummaryItem;
  index: number;
  onRetry: (index: number, item: SummaryItem) => void;
}

export const SummaryItemRow = memo(function SummaryItemRow({
  item,
  index,
  onRetry,
}: SummaryItemRowProps) {
  const handleRetry = useCallback(
    () => onRetry(index, item),
    [onRetry, index, item],
  );

  const sender = getSenderDisplayName(item.thread.participants);

  return (
    <View className="mb-3 rounded-xl bg-zinc-900 p-4">
      <Text className="text-sm font-semibold text-indigo-400" numberOfLines={1}>
        {sender}
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
            onPress={handleRetry}
            hitSlop={8}
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
