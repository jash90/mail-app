import { Pressable, Text } from 'react-native';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** Reusable filter chip (checkbox/radio style) */
export default function FilterChip({
  label,
  active,
  onPress,
}: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3.5 py-1.5 ${
        active ? 'bg-white' : 'bg-white/10'
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          active ? 'text-black' : 'text-gray-300'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
