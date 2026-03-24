import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { usePolishVoiceStore } from '@/store/polishVoiceStore';
import { TTSService } from './TTSService';
import {
  POLISH_VOICES,
  getPolishVoiceById,
  getModelFilePath,
  polishVoiceToTTSModel,
} from './models';

const MODEL_BASE_DIR = `${RNFS.DocumentDirectoryPath}/tts-model`;

export function usePolishVoices() {
  const selectedVoiceId = usePolishVoiceStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = usePolishVoiceStore((s) => s.setSelectedVoiceId);

  const [downloadedVoiceIds, setDownloadedVoiceIds] = useState<Set<string>>(
    new Set(),
  );
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  const refreshDownloaded = useCallback(async () => {
    const results = await Promise.all(
      POLISH_VOICES.map(async (v) => ({
        id: v.id,
        exists: await RNFS.exists(getModelFilePath(v.modelName, v.onnxFile)),
      })),
    );
    if (!mountedRef.current) return;
    setDownloadedVoiceIds(
      new Set(results.filter((r) => r.exists).map((r) => r.id)),
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshDownloaded();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshDownloaded]);

  const selectVoice = useCallback(
    async (id: string) => {
      if (downloading) return;

      const voice = getPolishVoiceById(id);
      if (!voice) return;

      const model = polishVoiceToTTSModel(voice);
      const alreadyDownloaded = await RNFS.exists(
        getModelFilePath(voice.modelName, voice.onnxFile),
      );

      if (!alreadyDownloaded) {
        setDownloading(id);
        setProgress(0);
        try {
          // Download using a temporary approach — call ensureModelDownloaded
          // which delegates to _ensureModelDownloaded (handles download + extract)
          await TTSService.shared().ensureModelDownloaded(model);
          if (!mountedRef.current) return;
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
      setSelectedVoiceId(id);

      // Invalidate current TTS model and clear audio cache so next playback
      // uses the new voice
      TTSService.shared().invalidateCurrentModel();
      await TTSService.shared().clearCache();
      await refreshDownloaded();
    },
    [downloading, setSelectedVoiceId, refreshDownloaded],
  );

  const deleteVoice = useCallback(
    (id: string) => {
      const voice = getPolishVoiceById(id);
      if (!voice) return;

      if (id === selectedVoiceId) {
        Alert.alert('Aktywny głos', 'Nie można usunąć aktywnego głosu.');
        return;
      }

      Alert.alert(
        'Usuń model',
        `Usunąć model "${voice.label}"? Można go pobrać ponownie.`,
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: async () => {
              const modelDir = `${MODEL_BASE_DIR}/${voice.modelName}`;
              await RNFS.unlink(modelDir).catch(() => {});
              await refreshDownloaded();
            },
          },
        ],
      );
    },
    [selectedVoiceId, refreshDownloaded],
  );

  return {
    voices: POLISH_VOICES,
    selectedVoiceId,
    downloadedVoiceIds,
    downloading,
    progress,
    selectVoice,
    deleteVoice,
  };
}
