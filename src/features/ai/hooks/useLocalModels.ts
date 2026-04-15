import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAiSettingsStore } from '@/src/shared/store/aiSettingsStore';
import {
  downloadModel,
  deleteModel,
  isModelDownloaded,
} from '../services/modelDownloader';
import { releaseLocalProvider } from '../providers/local';
import { LOCAL_MODELS } from '../types';

export function useLocalModels() {
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
