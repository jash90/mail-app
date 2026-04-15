import { Text, View } from 'react-native';
import type { RecentUsageEntry } from '@/src/shared/db/repositories/aiTokens';
import {
  formatDate,
  formatNumber,
  formatTime,
  OPERATION_LABELS,
} from './helpers';

export function RecentList({ data }: { data: RecentUsageEntry[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4 pb-8">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        Recent Requests
      </Text>
      {data.slice(0, 20).map((entry) => (
        <View
          key={entry.id}
          className="mb-1 flex-row items-center rounded-lg bg-zinc-900 px-3 py-2"
        >
          <Text className="mr-2 text-xs">
            {OPERATION_LABELS[entry.operation]?.charAt(0) ?? '🤖'}
          </Text>
          <View className="flex-1">
            <Text className="text-xs text-white" numberOfLines={1}>
              {entry.model}
            </Text>
            <Text className="text-xs text-zinc-500">
              {formatDate(entry.createdAt)} {formatTime(entry.createdAt)} · ⬆{' '}
              {entry.promptTokens} ⬇ {entry.completionTokens}
            </Text>
          </View>
          <Text className="text-xs font-bold text-indigo-400">
            {formatNumber(entry.totalTokens)}
          </Text>
        </View>
      ))}
    </View>
  );
}
