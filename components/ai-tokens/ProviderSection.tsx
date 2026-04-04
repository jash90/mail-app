import { Text, View } from 'react-native';
import type { TokensByProvider } from '@/db/repositories/aiTokens';
import { formatNumber } from './helpers';

export function ProviderSection({ data }: { data: TokensByProvider[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        By Provider / Model
      </Text>
      {data.map((p) => (
        <View
          key={`${p.provider}-${p.model}`}
          className="mb-2 rounded-lg bg-zinc-900 p-3"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-medium text-white">
                {p.provider.toUpperCase()}
              </Text>
              <Text className="text-xs text-zinc-500" numberOfLines={1}>
                {p.model}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-sm font-bold text-indigo-400">
                {formatNumber(p.totalTokens)} tok
              </Text>
              <Text className="text-xs text-zinc-500">
                {p.requestCount} req
              </Text>
            </View>
          </View>
          <View className="mt-2 flex-row gap-3">
            <Text className="text-xs text-zinc-500">
              ⬆ {formatNumber(p.promptTokens)}
            </Text>
            <Text className="text-xs text-zinc-500">
              ⬇ {formatNumber(p.completionTokens)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
