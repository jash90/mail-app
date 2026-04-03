import Icon from '@expo/vector-icons/SimpleLineIcons';
import { Pressable, Text, View } from 'react-native';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: string;
}

/** Reusable filter chip (checkbox/radio style) */
export default function FilterChip({
  label,
  active,
  onPress,
  icon,
}: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3.5 py-1.5 ${
        active ? 'bg-white' : 'bg-white/10'
      }`}
    >
      <View className="flex-row items-center gap-1.5">
        {icon && (
          <Icon
            name={icon as any}
            size={12}
            color={active ? '#000' : '#d1d5db'}
          />
        )}
        <Text
          className={`text-xs font-medium ${
            active ? 'text-black' : 'text-gray-300'
          }`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
