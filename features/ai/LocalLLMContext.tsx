import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLLM, type Message } from 'react-native-executorch';
import { LOCAL_MODELS } from './types';
import { useAiSettingsStore } from '@/store/aiSettingsStore';

type GenerateFn = (
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
) => Promise<string>;

export type ModelErrorKind = 'download' | 'memory' | 'generation' | 'unknown';

interface LocalLLMContextValue {
  isReady: boolean;
  isGenerating: boolean;
  /** 0–1 */
  downloadProgress: number;
  error: string | null;
  errorKind: ModelErrorKind | null;
  didAutoFallback: boolean;
  generate: GenerateFn;
  interrupt: () => void;
  retry: () => void;
}

const EMPTY_CONTEXT: LocalLLMContextValue = {
  isReady: false,
  isGenerating: false,
  downloadProgress: 0,
  error: null,
  errorKind: null,
  didAutoFallback: false,
  generate: async () => {
    throw new Error('Lokalny model nie jest załadowany.');
  },
  interrupt: () => {},
  retry: () => {},
};

const LocalLLMContext = createContext<LocalLLMContextValue>(EMPTY_CONTEXT);

/**
 * Bridge umożliwiający wywołanie generate() poza React (np. w providers/local.ts).
 */
export const localLLMBridge: {
  generate: GenerateFn | null;
  interrupt: (() => void) | null;
} = {
  generate: null,
  interrupt: null,
};

/** Czas (ms) na zwolnienie pamięci po usunięciu modelu przed załadowaniem nowego. */
const MODEL_UNLOAD_DELAY_MS = 200;

function safeInterrupt() {
  try {
    localLLMBridge.interrupt?.();
  } catch {
    // Model może nie być załadowany — ignoruj
  }
}

// ─── Klasyfikacja błędów ─────────────────────────────────────────────────────

function classifyError(error: unknown): {
  kind: ModelErrorKind;
  message: string;
} {
  const msg = String(error).toLowerCase();

  if (
    msg.includes('download') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('uri')
  ) {
    return {
      kind: 'download',
      message: 'Pobieranie przerwane. Sprawdź połączenie i spróbuj ponownie.',
    };
  }

  if (
    msg.includes('memory') ||
    msg.includes('oom') ||
    msg.includes('alloc') ||
    msg.includes('jetsam')
  ) {
    return {
      kind: 'memory',
      message:
        'Brak pamięci. Zamknij inne aplikacje lub wybierz mniejszy model.',
    };
  }

  if (msg.includes('generate') || msg.includes('forward')) {
    return {
      kind: 'generation',
      message: 'Błąd generowania. Spróbuj ponownie lub zmień model.',
    };
  }

  return { kind: 'unknown', message: String(error) };
}

// ─── Wewnętrzny komponent z hookiem ────────────────────────────────────────

function LLMLoader({
  modelId,
  onRetry,
  onAutoFallback,
  children,
}: {
  modelId: string;
  onRetry: () => void;
  onAutoFallback: () => void;
  children: ReactNode;
}) {
  const setAiProvider = useAiSettingsStore((s) => s.setAiProvider);
  const setModelSwitchPhase = useAiSettingsStore((s) => s.setModelSwitchPhase);
  const model = LOCAL_MODELS.find((m) => m.id === modelId) ?? LOCAL_MODELS[0];

  const llm = useLLM({ model: model.modelSource });

  const llmStateRef = useRef({ isReady: false, isGenerating: false });
  llmStateRef.current = {
    isReady: llm.isReady,
    isGenerating: llm.isGenerating,
  };

  // Gdy model staje się gotowy, ustaw fazę na idle
  useEffect(() => {
    if (llm.isReady) {
      setModelSwitchPhase('idle');
    }
  }, [llm.isReady, setModelSwitchPhase]);

  // Auto-fallback na Cloud przy błędzie ładowania
  useEffect(() => {
    if (llm.error) {
      setAiProvider('cloud');
      onAutoFallback();
    }
  }, [llm.error, setAiProvider, onAutoFallback]);

  const generate: GenerateFn = async (messages, signal) => {
    if (!llm.isReady) throw new Error('Model nie jest gotowy');
    if (signal?.aborted) throw new Error('Anulowano');

    const onAbort = () => llm.interrupt();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await llm.generate(messages as Message[]);
      if (!response) throw new Error('Model zwrócił pustą odpowiedź');
      return response;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  };

  // Synchronizuj bridge
  localLLMBridge.generate = llm.isReady ? generate : null;
  localLLMBridge.interrupt = llm.interrupt;

  // Przy odmontowaniu — przerwij generowanie zanim useLLM cleanup wywoła delete().
  useEffect(() => {
    return () => {
      if (llmStateRef.current.isGenerating) {
        try {
          llm.interrupt();
        } catch {
          // Model mógł zostać usunięty — ignoruj
        }
      }
      localLLMBridge.generate = null;
      localLLMBridge.interrupt = null;
    };
  }, [llm.interrupt]);

  const classified = llm.error ? classifyError(llm.error) : null;

  return (
    <LocalLLMContext.Provider
      value={{
        isReady: llm.isReady,
        isGenerating: llm.isGenerating,
        downloadProgress: llm.downloadProgress,
        error: classified?.message ?? null,
        errorKind: classified?.kind ?? null,
        didAutoFallback: false,
        generate,
        interrupt: llm.interrupt,
        retry: onRetry,
      }}
    >
      {children}
    </LocalLLMContext.Provider>
  );
}

// ─── Publiczny Provider z gated unmount ──────────────────────────────────────

export function LocalLLMProvider({ children }: { children: ReactNode }) {
  const aiProvider = useAiSettingsStore((s) => s.aiProvider);
  const localModelId = useAiSettingsStore((s) => s.localModelId);
  const setModelSwitchPhase = useAiSettingsStore((s) => s.setModelSwitchPhase);

  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [shouldRenderLoader, setShouldRenderLoader] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [didAutoFallback, setDidAutoFallback] = useState(false);

  const prevAiProviderRef = useRef<string | null>(null);
  const prevLocalModelIdRef = useRef<string | null>(null);

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  const handleAutoFallback = useCallback(() => {
    setDidAutoFallback(true);
  }, []);

  useEffect(() => {
    const prevProvider = prevAiProviderRef.current;
    const prevModelId = prevLocalModelIdRef.current;
    prevAiProviderRef.current = aiProvider;
    prevLocalModelIdRef.current = localModelId;

    const needsLoader = aiProvider === 'local';

    // Pierwszy mount po hydration
    if (prevProvider === null) {
      if (needsLoader) {
        setActiveModelId(localModelId);
        setShouldRenderLoader(true);
        setModelSwitchPhase('loading');
      }
      return;
    }

    const modelChanged =
      needsLoader && localModelId !== prevModelId && prevProvider === 'local';
    const switchedToCloud = !needsLoader && prevProvider === 'local';
    const switchedToLocal = needsLoader && prevProvider !== 'local';

    // Przełączenie Local → Cloud: gated unmount
    if (switchedToCloud) {
      safeInterrupt();
      localLLMBridge.generate = null;
      setModelSwitchPhase('unloading');
      setShouldRenderLoader(false);

      const timer = setTimeout(() => {
        setModelSwitchPhase('idle');
      }, MODEL_UNLOAD_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Zmiana modelu (Local → Local): gated remount
    if (modelChanged) {
      safeInterrupt();
      localLLMBridge.generate = null;
      setModelSwitchPhase('unloading');
      setShouldRenderLoader(false);

      const timer = setTimeout(() => {
        setActiveModelId(localModelId);
        setShouldRenderLoader(true);
        setModelSwitchPhase('loading');
      }, MODEL_UNLOAD_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Przełączenie Cloud → Local: mount bez delay
    if (switchedToLocal) {
      setDidAutoFallback(false);
      setActiveModelId(localModelId);
      setShouldRenderLoader(true);
      setModelSwitchPhase('loading');
      return;
    }
  }, [aiProvider, localModelId, setModelSwitchPhase]);

  const emptyWithFallback = React.useMemo(
    () => ({ ...EMPTY_CONTEXT, didAutoFallback }),
    [didAutoFallback],
  );

  if (!shouldRenderLoader || !activeModelId) {
    return (
      <LocalLLMContext.Provider value={emptyWithFallback}>
        {children}
      </LocalLLMContext.Provider>
    );
  }

  return (
    <LLMLoader
      key={`${activeModelId}-${retryKey}`}
      modelId={activeModelId}
      onRetry={handleRetry}
      onAutoFallback={handleAutoFallback}
    >
      {children}
    </LLMLoader>
  );
}

// ─── Hook konsumencki ───────────────────────────────────────────────────────

export function useLocalLLM(): LocalLLMContextValue {
  return useContext(LocalLLMContext);
}
