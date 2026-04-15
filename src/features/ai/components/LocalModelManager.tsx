import { Alert, Pressable, Text, View } from 'react-native';
import { LOCAL_MODELS } from '@/src/features/ai/types';
import { ModelCard } from './ModelCard';
import { useLocalModels } from '@/src/features/ai/hooks/useLocalModels';
import { NER_MODEL_ID } from '@/src/features/ai/anonymization/ner';

const LOCAL_MODELS_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

// The NER model has its own Settings section (PrivacySection) and must not
// appear in the chat model picker.
const CHAT_MODELS = LOCAL_MODELS.filter((m) => m.id !== NER_MODEL_ID);

export function LocalModelManager() {
  const {
    aiProvider,
    localModelId,
    downloaded,
    downloading,
    progress,
    setAiProvider,
    selectModel,
    removeModel,
  } = useLocalModels();

  if (!LOCAL_MODELS_ENABLED) return null;

  return (
    <View className="mt-4">
      <Text className="mb-3 text-base font-semibold text-white">
        AI Provider
      </Text>

      {/* Provider toggle */}
      <View className="mb-4 flex-row gap-2">
        <Pressable
          className={`flex-1 rounded-xl p-3 ${
            aiProvider === 'cloud' ? 'bg-blue-600' : 'bg-zinc-900'
          }`}
          onPress={() => setAiProvider('cloud')}
        >
          <Text className="text-center text-sm font-semibold text-white">
            Cloud (Z.AI)
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-xl p-3 ${
            aiProvider === 'local' ? 'bg-blue-600' : 'bg-zinc-900'
          }`}
          onPress={() => {
            if (downloaded.size > 0) {
              setAiProvider('local');
            } else {
              Alert.alert('Brak modelu', 'Najpierw pobierz model lokalny.');
            }
          }}
        >
          <Text className="text-center text-sm font-semibold text-white">
            Local (On-Device)
          </Text>
        </Pressable>
      </View>

      {/* Model list */}
      <Text className="mb-2 text-xs text-zinc-500">
        Dotknij aby pobrać i aktywować. Przytrzymaj aby usunąć.
      </Text>

      {CHAT_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          isActive={aiProvider === 'local' && localModelId === model.id}
          isDownloaded={downloaded.has(model.id)}
          isDownloading={downloading === model.id}
          progress={progress}
          disabled={downloading !== null}
          onPress={() => selectModel(model.id)}
          onLongPress={() => removeModel(model.id)}
        />
      ))}
    </View>
  );
}
