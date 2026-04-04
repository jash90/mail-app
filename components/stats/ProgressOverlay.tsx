import { getProgressLabel, getProgressValue } from '@/features/stats/helpers';
import type { StatsProgress } from '@/features/stats/types';
import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  progress: StatsProgress;
  visible: boolean;
}

export default function ProgressOverlay({ progress, visible }: Props) {
  if (!visible) return null;

  const { phase, loaded, total } = progress;
  const isRetrying = phase === 'retrying';
  const isListing = phase === 'listing';
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;

  const label = getProgressLabel(phase);
  const value = getProgressValue(phase, loaded, total);

  return (
    <View className="mb-3 rounded-lg bg-zinc-900 p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-zinc-400">{label}</Text>
        <Text
          className={`text-xs font-medium ${isRetrying ? 'text-amber-400' : 'text-indigo-400'}`}
        >
          {value}
        </Text>
      </View>
      {!isListing && total > 0 && (
        <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <View
            className={`h-full rounded-full ${isRetrying ? 'bg-amber-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </View>
      )}
      {isListing && (
        <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <View className="h-full w-1/3 rounded-full bg-indigo-500 opacity-50" />
        </View>
      )}
    </View>
  );
}
