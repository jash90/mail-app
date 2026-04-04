import { Text, View } from 'react-native';
import type { TokensByOperation } from '@/db/repositories/aiTokens';
import { formatNumber, OPERATION_COLORS, OPERATION_LABELS } from './helpers';

export function OperationSection({ data }: { data: TokensByOperation[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        By Operation
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {data.map((op) => (
          <View
            key={op.operation}
            className={`rounded-lg p-3 ${OPERATION_COLORS[op.operation] ?? 'bg-zinc-800'}`}
            style={{ minWidth: '47%' }}
          >
            <Text className="text-sm font-medium text-white">
              {OPERATION_LABELS[op.operation] ?? op.operation}
            </Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatNumber(op.totalTokens)}
            </Text>
            <Text className="text-xs text-zinc-400">
              {op.requestCount} requests
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
