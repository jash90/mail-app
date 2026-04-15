import Icon from '@expo/vector-icons/SimpleLineIcons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

export const SummaryHeader = memo(function SummaryHeader({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <View className="flex-row items-center gap-4 p-4">
      <Text className="flex-1 text-2xl font-bold text-white">AI Summary</Text>
      {__DEV__ && (
        <Pressable onPress={onClear} hitSlop={12}>
          <Icon name="trash" size={18} color="#f87171" />
        </Pressable>
      )}
    </View>
  );
});
