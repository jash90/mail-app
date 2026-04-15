import React from 'react';
import { View, Text } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';

interface StatCardProps {
  icon: string;
  value: string | number;
  label: string;
}

export default function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <View className="flex-1 items-center rounded-xl bg-zinc-900 p-3">
      <Icon name={icon as any} size={18} color="#a1a1aa" />
      <Text className="mt-1 text-xl font-bold text-white">{value}</Text>
      <Text className="text-xs text-zinc-400">{label}</Text>
    </View>
  );
}
