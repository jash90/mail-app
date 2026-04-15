import { Text, View } from 'react-native';
import type { TokensByDay } from '@/src/shared/db/repositories/aiTokens';
import { formatDate } from './helpers';

export function DailyChart({ data }: { data: TokensByDay[] }) {
  if (data.length === 0) return null;
  const sorted = [...data].reverse();
  const maxTokens = Math.max(...sorted.map((d) => d.totalTokens), 1);

  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        Daily Usage (last 30 days)
      </Text>
      <View className="rounded-lg bg-zinc-900 p-3">
        <View className="flex-row items-end gap-1" style={{ height: 100 }}>
          {sorted.map((d) => {
            const h = Math.max((d.totalTokens / maxTokens) * 80, 2);
            return (
              <View key={d.day} className="flex-1 items-center">
                <View
                  className="w-full rounded-t bg-indigo-500"
                  style={{ height: h }}
                />
              </View>
            );
          })}
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-xs text-zinc-600">
            {sorted[0]?.day ? formatDate(sorted[0].day) : ''}
          </Text>
          <Text className="text-xs text-zinc-600">
            {sorted[sorted.length - 1]?.day
              ? formatDate(sorted[sorted.length - 1]!.day)
              : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}
