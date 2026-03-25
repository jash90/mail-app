import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import {
  downloadModel,
  deleteModel,
  isModelDownloaded,
} from './modelDownloader';
import { releaseLocalProvider } from './providers/local';
import { LOCAL_MODELS, type LocalModel } from './types';

function useLocalModels() {
  const aiProvider = useAiSettingsStore((s) => s.aiProvider);
  const localModelId = useAiSettingsStore((s) => s.localModelId);
  const setAiProvider = useAiSettingsStore((s) => s.setAiProvider);
  const setLocalModelId = useAiSettingsStore((s) => s.setLocalModelId);

  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    const ids = LOCAL_MODELS.filter((m) => isModelDownloaded(m.id)).map(
      (m) => m.id,
    );
    if (!mountedRef.current) return;
    setDownloaded(new Set(ids));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const selectModel = useCallback(
    async (id: string) => {
      if (downloading) return;

      const alreadyDownloaded = isModelDownloaded(id);

      if (!alreadyDownloaded) {
        setDownloading(id);
        setProgress(0);
        try {
          await downloadModel(id, (pct) => {
            if (mountedRef.current) setProgress(pct);
          });
        } catch (err) {
          if (!mountedRef.current) return;
          setDownloading(null);
          setProgress(0);
          Alert.alert(
            'Błąd pobierania',
            err instanceof Error ? err.message : 'Pobieranie nie powiodło się',
          );
          return;
        }
      }

      if (!mountedRef.current) return;
      setDownloading(null);
      setProgress(0);

      // Release old context if switching models
      await releaseLocalProvider();
      setLocalModelId(id);
      setAiProvider('local');
      refresh();
    },
    [downloading, setLocalModelId, setAiProvider, refresh],
  );

  const removeModel = useCallback(
    (id: string) => {
      const model = LOCAL_MODELS.find((m) => m.id === id);
      if (!model) return;

      if (id === localModelId && aiProvider === 'local') {
        Alert.alert(
          'Aktywny model',
          'Nie można usunąć aktywnego modelu. Przełącz na Cloud lub wybierz inny model.',
        );
        return;
      }

      Alert.alert(
        'Usuń model',
        `Usunąć "${model.label}"? Można go pobrać ponownie.`,
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: () => {
              deleteModel(id);
              refresh();
            },
          },
        ],
      );
    },
    [localModelId, aiProvider, refresh],
  );

  return {
    aiProvider,
    localModelId,
    downloaded,
    downloading,
    progress,
    setAiProvider,
    selectModel,
    removeModel,
  };
}

const LOCAL_MODELS_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

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

      {LOCAL_MODELS.map((model) => (
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

function ModelCard({
  model,
  isActive,
  isDownloaded,
  isDownloading,
  progress,
  disabled,
  onPress,
  onLongPress,
}: {
  model: LocalModel;
  isActive: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
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
