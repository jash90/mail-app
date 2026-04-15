import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

interface Props {
  hourOfDay: number[];
  dayOfWeek: number[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimeChart({ hourOfDay, dayOfWeek }: Props) {
  const [mode, setMode] = useState<'hour' | 'day'>('hour');

  const data = mode === 'hour' ? hourOfDay : dayOfWeek;
  const labels =
    mode === 'hour'
      ? Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}` : ''))
      : DAY_LABELS;
  const maxVal = Math.max(...data, 1);

  return (
    <View className="mt-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-white">
          Activity by {mode === 'hour' ? 'Hour' : 'Day'}
        </Text>
        <View className="flex-row rounded-lg bg-zinc-800">
          <Pressable
            className={`rounded-lg px-3 py-1 ${mode === 'hour' ? 'bg-indigo-600' : ''}`}
            onPress={() => setMode('hour')}
          >
            <Text className="text-xs text-white">Hour</Text>
          </Pressable>
          <Pressable
            className={`rounded-lg px-3 py-1 ${mode === 'day' ? 'bg-indigo-600' : ''}`}
            onPress={() => setMode('day')}
          >
            <Text className="text-xs text-white">Day</Text>
          </Pressable>
        </View>
      </View>

      <View className="h-32 flex-row items-end justify-between rounded-xl bg-zinc-900 px-2 pt-2 pb-4">
        {data.map((val, i) => (
          <View key={i} className="flex-1 items-center">
            <View
              className="w-full max-w-[12px] rounded-t bg-indigo-500"
              style={{
                height: `${(val / maxVal) * 100}%`,
                minHeight: val > 0 ? 2 : 0,
              }}
            />
          </View>
        ))}
      </View>
      <View className="mt-1 flex-row justify-between px-2">
        {labels.map((label, i) => (
          <Text
            key={i}
            className="flex-1 text-center text-[10px] text-zinc-500"
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
