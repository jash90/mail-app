import { FlashList } from '@shopify/flash-list';
import { Pressable, Text, View } from 'react-native';
import { usePolishVoices } from '@/src/features/tts/hooks/usePolishVoices';
import type { PolishVoice } from '@/src/features/tts/services/models';

export function PolishVoiceSelector() {
  const {
    voices,
    selectedVoiceId,
    downloadedVoiceIds,
    downloading,
    progress,
    selectVoice,
    deleteVoice,
  } = usePolishVoices();

  const renderItem = ({ item }: { item: PolishVoice }) => {
    const isActive = item.id === selectedVoiceId;
    const isDownloaded = downloadedVoiceIds.has(item.id);
    const isDownloading = downloading === item.id;

    return (
      <Pressable
        className={`mr-3 flex-1 items-center rounded-xl border-2 p-3 ${
          isActive
            ? 'border-blue-500 bg-zinc-800'
            : 'border-transparent bg-zinc-900'
        }`}
        onPress={() => selectVoice(item.id)}
        onLongPress={() => deleteVoice(item.id)}
        disabled={downloading !== null}
      >
        <Text className="text-lg">{item.gender === 'female' ? '♀' : '♂'}</Text>
        <Text
          className={`text-sm font-semibold ${isActive ? 'text-blue-400' : 'text-white'}`}
        >
          {item.label}
        </Text>

        {isDownloading ? (
          <View className="mt-2 h-1 w-4/5 overflow-hidden rounded-full bg-zinc-700">
            <View
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${progress * 100}%` }}
            />
          </View>
        ) : (
          <Text className="mt-1 text-xs text-zinc-500">
            {isDownloaded ? '✓' : item.size}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View className="mt-4">
      <Text className="mb-2 text-base font-semibold text-white">
        Polski głos (DEV)
      </Text>
      <Text className="mb-3 text-xs text-zinc-500">
        Przytrzymaj aby usunąć pobrany model
      </Text>
      <FlashList
        data={voices}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        scrollEnabled={false}
        contentContainerStyle={{ gap: 10 }}
      />
    </View>
  );
}
