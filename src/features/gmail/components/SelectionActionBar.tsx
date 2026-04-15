import Icon from '@expo/vector-icons/SimpleLineIcons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SelectionActionBarProps = {
  count: number;
  isProcessing: boolean;
  onDelete: () => void;
  onArchive: () => void;
  onMarkAsRead: () => void;
  onCancel: () => void;
};

export default function SelectionActionBar({
  count,
  isProcessing,
  onDelete,
  onArchive,
  onMarkAsRead,
  onCancel,
}: SelectionActionBarProps) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View
      className="absolute right-0 bottom-0 left-0 flex-row items-center justify-between border-t border-zinc-700 bg-zinc-900 px-4 pt-3"
      style={{ paddingBottom: Math.max(bottom, 12) }}
    >
      <View className="flex-row items-center gap-3">
        <Pressable onPress={onCancel} hitSlop={8} disabled={isProcessing}>
          <Icon name="close" size={18} color="#a1a1aa" />
        </Pressable>
        <Text className="text-sm font-semibold text-white">
          {count} selected
        </Text>
      </View>

      {isProcessing ? (
        <ActivityIndicator color="white" />
      ) : (
        <View className="flex-row items-center gap-5">
          <Pressable onPress={onMarkAsRead} hitSlop={8}>
            <Icon name="envelope-open" size={18} color="#818cf8" />
          </Pressable>
          <Pressable onPress={onArchive} hitSlop={8}>
            <Icon name="drawer" size={18} color="#818cf8" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8}>
            <Icon name="trash" size={18} color="#f87171" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
