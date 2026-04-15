import { getMaxContactValue } from '@/src/features/stats/services/helpers';
import type { ContactStats } from '@/src/features/stats/types';
import React from 'react';
import { Text, View } from 'react-native';

interface Props {
  title: string;
  contacts: ContactStats[];
  valueKey: 'totalCount' | 'receivedCount' | 'sentCount';
}

export default function ContactRankingList({
  title,
  contacts,
  valueKey,
}: Props) {
  if (contacts.length === 0) return null;

  const maxValue = getMaxContactValue(contacts, valueKey);

  return (
    <View className="mt-4">
      <Text className="mb-2 text-lg font-semibold text-white">{title}</Text>
      {contacts.slice(0, 7).map((contact) => {
        const value = contact[valueKey] ?? contact.totalCount;
        const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;

        return (
          <View key={contact.email} className="mb-2">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-sm text-zinc-300" numberOfLines={1}>
                {contact.email}
              </Text>
              <Text className="ml-2 text-sm font-medium text-zinc-400">
                {value}
              </Text>
            </View>
            <View className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
              <View
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${barWidth}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
