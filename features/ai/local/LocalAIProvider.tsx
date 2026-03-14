import { createContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useLLM } from 'react-native-executorch';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import { registerLocalGenerate } from '../providers/local';
import { clearLocalProvider, setLocalProvider } from '../providers';
import { localProvider } from '../providers/local';
import { DEFAULT_MODEL, getModelById } from './model-manager';

interface StreamingState {
  response: string;
  isGenerating: boolean;
}

export const StreamingContext = createContext<StreamingState>({
  response: '',
  isGenerating: false,
});

export function LocalAIProvider({ children }: { children: React.ReactNode }) {
  const provider = useAiSettingsStore((s) => s.provider);
  const setModelStatus = useAiSettingsStore((s) => s.setModelStatus);
  const setDownloadProgress = useAiSettingsStore((s) => s.setDownloadProgress);
  const setError = useAiSettingsStore((s) => s.setError);

  const selectedModelId = useAiSettingsStore((s) => s.selectedModelId);
  const wantsDownload = useAiSettingsStore((s) => s.wantsDownload);
  const setWantsDownload = useAiSettingsStore((s) => s.setWantsDownload);
  const modelOption = getModelById(selectedModelId) ?? DEFAULT_MODEL;

  const shouldLoad = provider === 'local' || provider === 'auto';

  const llm = useLLM({
    model: modelOption.model,
    preventLoad: !shouldLoad || !wantsDownload,
  });

  const prevIsReady = useRef(false);
  const prevModelId = useRef(selectedModelId);

  // Reset status when user switches model
  useEffect(() => {
    if (prevModelId.current !== selectedModelId) {
      prevModelId.current = selectedModelId;
      prevIsReady.current = false;
      registerLocalGenerate(null);
      clearLocalProvider();
      setModelStatus('not-downloaded');
      setDownloadProgress(0);
      setError(null);
      setWantsDownload(false);
    }
  }, [selectedModelId, setModelStatus, setDownloadProgress, setError, setWantsDownload]);

  // Configure LLM generation params once ready
  useEffect(() => {
    if (llm.isReady) {
      llm.configure({
        generationConfig: {
          temperature: 0.7,
          topp: 0.9,
        },
      });
    }
  }, [llm.isReady, llm.configure]);

  // Sync LLM hook state to store + register/unregister generate fn
  useEffect(() => {
    if (!shouldLoad) {
      registerLocalGenerate(null);
      clearLocalProvider();
      return;
    }

    if (llm.error) {
      setModelStatus('error');
      setError(String(llm.error));
      registerLocalGenerate(null);
      clearLocalProvider();
    } else if (llm.isReady && !prevIsReady.current) {
      setModelStatus('ready');
      setDownloadProgress(1);
      setError(null);
      registerLocalGenerate(llm.generate);
      setLocalProvider(localProvider);
    } else if (llm.downloadProgress > 0 && llm.downloadProgress < 1) {
      setModelStatus('downloading');
      setDownloadProgress(llm.downloadProgress);
    }

    prevIsReady.current = llm.isReady;
  }, [
    shouldLoad,
    llm.isReady,
    llm.downloadProgress,
    llm.error,
    llm.generate,
    setModelStatus,
    setDownloadProgress,
    setError,
  ]);

  // Unload model after 5 min of app inactivity
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimerRef.current = setTimeout(() => {
          if (llm.isReady) {
            registerLocalGenerate(null);
            clearLocalProvider();
            setModelStatus('downloaded');
          }
        }, 5 * 60 * 1000);
      } else if (nextState === 'active') {
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
        }
      }
    });

    return () => {
      subscription.remove();
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
      }
    };
  }, [llm.isReady, setModelStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      registerLocalGenerate(null);
      clearLocalProvider();
    };
  }, []);

  // Streaming context — direct propagation, no useEffect delay
  const streamingValue = useMemo<StreamingState>(
    () => ({ response: llm.response, isGenerating: llm.isGenerating }),
    [llm.response, llm.isGenerating],
  );

  return (
    <StreamingContext.Provider value={streamingValue}>
      {children}
    </StreamingContext.Provider>
  );
}
