import { Alert, Pressable, Text, View } from 'react-native';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import { useLlmStore } from '@/store/llmStore';
import { LOCAL_MODELS, type LocalModel } from './types';

export function LocalModelManager() {
  const aiProvider = useAiSettingsStore((s) => s.aiProvider);
  const localModelId = useAiSettingsStore((s) => s.localModelId);
  const setAiProvider = useAiSettingsStore((s) => s.setAiProvider);
  const setLocalModelId = useAiSettingsStore((s) => s.setLocalModelId);

  const LOCAL_MODELS_ENABLED =
    process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

  const {
    isReady,
    isGenerating,
    isLoading,
    downloadProgress,
    error,
    errorKind,
    didAutoFallback,
    retry,
    deleteModelFiles,
  } = useLlmStore();

  const handleSelectModel = (id: string) => {
    if (isLoading) return;
    if (isGenerating && !error) {
      Alert.alert('Model pracuje', 'Poczekaj na zakończenie generowania.');
      return;
    }
    setLocalModelId(id);
    setAiProvider('local');
  };

  const handleDeleteModel = (modelId: string) => {
    const model = LOCAL_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    Alert.alert(
      'Usuń model',
      `Usunąć pobrany model ${model.label}? Będzie trzeba go pobrać ponownie.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () => deleteModelFiles(modelId),
        },
      ],
    );
  };

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
          onPress={() => setAiProvider('local')}
        >
          <Text className="text-center text-sm font-semibold text-white">
            Local (On-Device)
          </Text>
        </Pressable>
      </View>

      {/* Auto-fallback banner */}
      {aiProvider === 'cloud' && didAutoFallback && (
        <View className="mb-3 rounded-lg bg-amber-900/30 p-3">
          <Text className="text-xs text-amber-400">
            Automatycznie przełączono na Cloud z powodu błędu modelu lokalnego.
          </Text>
          <Pressable
            className="mt-2"
            onPress={() => handleDeleteModel(localModelId)}
          >
            <Text className="text-xs text-red-400">
              Usuń pobrany model (
              {LOCAL_MODELS.find((m) => m.id === localModelId)?.label})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Status aktywnego modelu */}
      {aiProvider === 'local' && (
        <View className="mb-3">
          {isLoading && downloadProgress > 0 && downloadProgress < 1 && (
            <Text className="text-sm text-zinc-400">
              Pobieranie: {Math.round(downloadProgress * 100)}%
            </Text>
          )}
          {isLoading && downloadProgress === 0 && !error && (
            <Text className="text-sm text-zinc-400">Ładowanie modelu…</Text>
          )}
          {isReady && (
            <Text className="text-sm text-green-500">✓ Model gotowy</Text>
          )}
          {error && (
            <View>
              <Text className="text-sm text-red-400" numberOfLines={3}>
                {error}
              </Text>
              {errorKind === 'download' && (
                <Pressable
                  className="mt-2 rounded-lg bg-zinc-800 p-2"
                  onPress={retry}
                >
                  <Text className="text-center text-sm text-blue-400">
                    ↻ Ponów pobieranie
                  </Text>
                </Pressable>
              )}
              {errorKind === 'memory' && (
                <Text className="mt-1 text-xs text-zinc-500">
                  Spróbuj mniejszego modelu (np. Llama 3.2 1B — 700 MB)
                </Text>
              )}
              {(errorKind === 'generation' || errorKind === 'unknown') && (
                <Pressable
                  className="mt-2 rounded-lg bg-zinc-800 p-2"
                  onPress={retry}
                >
                  <Text className="text-center text-sm text-blue-400">
                    ↻ Spróbuj ponownie
                  </Text>
                </Pressable>
              )}
              <Pressable
                className="mt-2 rounded-lg bg-zinc-800 p-2"
                onPress={() => handleDeleteModel(localModelId)}
              >
                <Text className="text-center text-sm text-red-400">
                  Usuń pobrany model
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Model list */}
      <Text className="mb-2 text-xs text-zinc-500">
        Dotknij aby załadować model.
      </Text>

      {LOCAL_MODELS.map((model) => {
        const isActive = localModelId === model.id && aiProvider === 'local';
        const isModelLoading = isActive && isLoading;
        return (
          <ModelCard
            key={model.id}
            model={model}
            isActive={isActive}
            isLoading={isModelLoading}
            disabled={isLoading}
            downloadProgress={isModelLoading ? downloadProgress : 0}
            onPress={() => handleSelectModel(model.id)}
          />
        );
      })}
    </View>
  );
}

function ModelCard({
  model,
  isActive,
  isLoading,
  disabled,
  downloadProgress,
  onPress,
}: {
  model: LocalModel;
  isActive: boolean;
  isLoading: boolean;
  disabled: boolean;
  downloadProgress: number;
  onPress: () => void;
}) {
  const sizeLabel =
    model.sizeMB >= 1000
      ? `${(model.sizeMB / 1000).toFixed(1)} GB`
      : `${model.sizeMB} MB`;

  const isLarge = model.sizeMB > 1500;
  const isQwen = model.id === 'qwen3-4b';

  return (
    <Pressable
      className={`mb-2 flex-row items-center justify-between rounded-xl border-2 p-3 ${
        isActive
          ? 'border-blue-500 bg-zinc-800'
          : 'border-transparent bg-zinc-900'
      }`}
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View className="flex-1">
        <Text
          className={`text-sm font-semibold ${isActive ? 'text-blue-400' : 'text-white'}`}
        >
          {model.label}
        </Text>
        <Text className="text-xs text-zinc-500">{sizeLabel}</Text>
        {isLarge && (
          <Text className="text-xs text-amber-500">
            Duży model — wymaga stabilnego WiFi
          </Text>
        )}
        {isQwen && (
          <Text className="text-xs text-amber-500">
            Możliwe problemy na Snapdragon
          </Text>
        )}
      </View>

      {isLoading && downloadProgress > 0 ? (
        <View className="w-20">
          <Text className="mb-1 text-right text-xs text-zinc-400">
            {Math.round(downloadProgress * 100)}%
          </Text>
          <View className="h-1 overflow-hidden rounded-full bg-zinc-700">
            <View
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${downloadProgress * 100}%` }}
            />
          </View>
        </View>
      ) : (
        <Text
          className={`text-xs ${isActive ? 'text-blue-400' : 'text-zinc-500'}`}
        >
          {isActive ? '● Aktywny' : 'Wybierz'}
        </Text>
      )}
    </Pressable>
  );
}
