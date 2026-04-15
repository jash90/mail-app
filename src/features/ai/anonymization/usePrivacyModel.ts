import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  downloadModel,
  deleteModel,
  isModelDownloaded,
} from '../services/modelDownloader';
import { LOCAL_MODELS } from '../types';
import { NER_MODEL_ID } from './ner';
import { releaseNerContext } from './nerContext';

interface PrivacyModelState {
  installed: boolean;
  downloading: boolean;
  progress: number;
  sizeMB: number;
  label: string;
  download: () => Promise<void>;
  remove: () => void;
}

/**
 * Lifecycle + UI state for the PII Detector (NER) model.
 *
 * Wraps `modelDownloader` for the specific model id referenced by
 * `NER_MODEL_ID`, so the Privacy settings section doesn't need to know
 * about chat models or the `useLocalModels` hook used for provider
 * selection.
 */
export function usePrivacyModel(): PrivacyModelState {
  const model = LOCAL_MODELS.find((m) => m.id === NER_MODEL_ID);
  if (!model) {
    throw new Error(
      `usePrivacyModel: NER_MODEL_ID '${NER_MODEL_ID}' is missing from LOCAL_MODELS`,
    );
  }

  const [installed, setInstalled] = useState<boolean>(() =>
    isModelDownloaded(NER_MODEL_ID),
  );
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setInstalled(isModelDownloaded(NER_MODEL_ID));
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const download = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);
    try {
      await downloadModel(NER_MODEL_ID, (pct) => {
        if (mountedRef.current) setProgress(pct);
      });
      if (mountedRef.current) {
        setInstalled(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      Alert.alert(
        'Błąd pobierania',
        err instanceof Error ? err.message : 'Pobieranie nie powiodło się',
      );
    } finally {
      if (mountedRef.current) {
        setDownloading(false);
        setProgress(0);
      }
    }
  }, [downloading]);

  const remove = useCallback(() => {
    Alert.alert(
      'Usuń PII Detector',
      'Cloud AI nie będzie dostępne dopóki model nie zostanie pobrany ponownie. Kontynuować?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            await releaseNerContext().catch(() => {});
            deleteModel(NER_MODEL_ID);
            if (mountedRef.current) setInstalled(false);
          },
        },
      ],
    );
  }, []);

  return {
    installed,
    downloading,
    progress,
    sizeMB: model.sizeMB,
    label: model.label,
    download,
    remove,
  };
}
