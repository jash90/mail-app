import React from 'react';
import { View, Text } from 'react-native';
import type { ContactStats } from '@/features/stats/types';
import { formatDuration } from '@/lib/formatDate';

interface Props {
  contacts: ContactStats[];
}

export default function ResponseTimeList({ contacts }: Props) {
  const withResponseTime = contacts.filter((c) => c.avgResponseTimeMs !== null);

  if (withResponseTime.length === 0) return null;

  const sorted = [...withResponseTime].sort(
    (a, b) => (a.avgResponseTimeMs ?? 0) - (b.avgResponseTimeMs ?? 0),
  );

  return (
    <View className="mt-4">
      <Text className="mb-2 text-lg font-semibold text-white">Response Times</Text>
      {sorted.slice(0, 7).map((contact) => {
        const displayName = contact.name || contact.email.split('@')[0];
        return (
          <View key={contact.email} className="mb-2 flex-row items-center justify-between">
            <Text className="flex-1 text-sm text-zinc-300" numberOfLines={1}>
              {displayName}
            </Text>
            <Text className="ml-2 text-sm text-zinc-400">
              avg {formatDuration(contact.avgResponseTimeMs!)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
