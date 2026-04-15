import React from 'react';
import { View, Text } from 'react-native';
import type { ThreadLengthBucket } from '@/src/features/stats/types';

interface Props {
  buckets: ThreadLengthBucket[];
  average: number;
  median: number;
}

export default function ThreadLengthChart({ buckets, average, median }: Props) {
  if (buckets.length === 0) return null;

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <View className="mt-4">
      <Text className="mb-1 text-lg font-semibold text-white">
        Thread Lengths
      </Text>
      <Text className="mb-2 text-xs text-zinc-500">
        avg {average.toFixed(1)} msgs · median {median.toFixed(1)} msgs
      </Text>
      {buckets.map((bucket) => (
        <View key={bucket.label} className="mb-1.5 flex-row items-center">
          <Text className="w-12 text-xs text-zinc-400">{bucket.label}</Text>
          <View className="flex-1 flex-row items-center">
            <View
              className="h-4 overflow-hidden rounded bg-zinc-800"
              style={{ flex: 1 }}
            >
              <View
                className="h-full rounded bg-indigo-500"
                style={{ width: `${(bucket.count / maxCount) * 100}%` }}
              />
            </View>
            <Text className="ml-2 w-8 text-right text-xs text-zinc-400">
              {bucket.count}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
