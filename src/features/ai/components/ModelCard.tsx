import { Pressable, Text, View } from 'react-native';
import type { LocalModel } from '@/src/features/ai/types';

interface ModelCardProps {
  model: LocalModel;
  isActive: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export function ModelCard({
  model,
  isActive,
  isDownloaded,
  isDownloading,
  progress,
  disabled,
  onPress,
  onLongPress,
}: ModelCardProps) {
  return (
    <Pressable
      className={`mb-2 flex-row items-center justify-between rounded-xl border-2 p-3 ${
        isActive
          ? 'border-blue-500 bg-zinc-800'
          : 'border-transparent bg-zinc-900'
      }`}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
    >
      <View className="flex-1">
        <Text
          className={`text-sm font-semibold ${isActive ? 'text-blue-400' : 'text-white'}`}
        >
          {model.label}
        </Text>
        <Text className="text-xs text-zinc-500">
          {model.sizeMB >= 1000
            ? `${(model.sizeMB / 1000).toFixed(1)} GB`
            : `${model.sizeMB} MB`}
        </Text>
      </View>

      {isDownloading ? (
        <View className="w-20">
          <Text className="mb-1 text-right text-xs text-zinc-400">
            {Math.round(progress * 100)}%
          </Text>
          <View className="h-1 overflow-hidden rounded-full bg-zinc-700">
            <View
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${progress * 100}%` }}
            />
          </View>
        </View>
      ) : (
        <Text
          className={`text-xs ${isActive ? 'text-blue-400' : isDownloaded ? 'text-green-500' : 'text-zinc-500'}`}
        >
          {isActive ? '● Aktywny' : isDownloaded ? '✓ Pobrany' : 'Pobierz'}
        </Text>
      )}
    </Pressable>
  );
}
