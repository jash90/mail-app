import { useContext } from 'react';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import { StreamingContext } from './LocalAIProvider';

export function useModelDownload() {
  const modelStatus = useAiSettingsStore((s) => s.modelStatus);
  const downloadProgress = useAiSettingsStore((s) => s.downloadProgress);
  const error = useAiSettingsStore((s) => s.error);

  const isDownloading = modelStatus === 'downloading';
  const isDownloaded =
    modelStatus === 'downloaded' ||
    modelStatus === 'ready' ||
    modelStatus === 'loading';

  return {
    modelStatus,
    downloadProgress,
    isDownloading,
    isDownloaded,
    error,
  };
}

export function useStreamingResponse() {
  const { response, isGenerating } = useContext(StreamingContext);
  return { streamingResponse: response, isGenerating };
}

