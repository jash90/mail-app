import Icon from '@expo/vector-icons/SimpleLineIcons';
import { Text, View } from 'react-native';

interface TotalCardProps {
  icon: string;
  value: string;
  label: string;
}

export function TotalCard({ icon, value, label }: TotalCardProps) {
  return (
    <View className="flex-1 items-center rounded-xl bg-zinc-900 p-3">
      <Icon name={icon as any} size={18} color="#a1a1aa" />
      <Text className="mt-1 text-lg font-bold text-white">{value}</Text>
      <Text className="text-xs text-zinc-400">{label}</Text>
    </View>
  );
}
