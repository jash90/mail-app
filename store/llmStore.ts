import { create } from 'zustand';
import {
  LLMModule,
  ResourceFetcher,
  RnExecutorchError,
  RnExecutorchErrorCode,
  type Message,
} from 'react-native-executorch';
import { LOCAL_MODELS } from '@/features/ai/types';
import { useAiSettingsStore } from './aiSettingsStore';

export type ModelErrorKind = 'download' | 'memory' | 'generation' | 'unknown';
export type LoadingPhase = 'idle' | 'downloading' | 'initializing';

function classifyError(error: unknown): {
  kind: ModelErrorKind;
  message: string;
} {
  if (error instanceof RnExecutorchError) {
    switch (error.code) {
      case RnExecutorchErrorCode.ResourceFetcherDownloadFailed:
      case RnExecutorchErrorCode.DownloadInterrupted:
      case RnExecutorchErrorCode.ResourceFetcherMissingUri:
        return {
          kind: 'download',
          message:
            'Pobieranie przerwane. Sprawdź połączenie i spróbuj ponownie.',
        };

      case RnExecutorchErrorCode.MemoryAllocationFailed:
      case RnExecutorchErrorCode.DelegateMemoryAllocationFailed:
      case RnExecutorchErrorCode.OutOfResources:
        return {
          kind: 'memory',
          message:
            'Brak pamięci. Zamknij inne aplikacje lub wybierz mniejszy model.',
        };

      case RnExecutorchErrorCode.ModelGenerating:
      case RnExecutorchErrorCode.InvalidUserInput:
      case RnExecutorchErrorCode.ModuleNotLoaded:
        return {
          kind: 'generation',
          message: 'Błąd generowania. Spróbuj ponownie lub zmień model.',
        };

      default:
        return { kind: 'unknown', message: error.message || String(error) };
    }
  }

  // Fallback: string matching for non-ExecuTorch errors
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

const INTERRUPT_WAIT_MS = 500;
const INTERRUPT_POLL_MS = 50;

async function waitForGenerationStop(
  isGenerating: () => boolean,
): Promise<void> {
  if (!isGenerating()) return;
  const deadline = Date.now() + INTERRUPT_WAIT_MS;
  while (isGenerating() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, INTERRUPT_POLL_MS));
  }
}

interface LlmState {
  isReady: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  loadingPhase: LoadingPhase;
  downloadProgress: number;
  error: string | null;
  errorKind: ModelErrorKind | null;
  loadedModelId: string | null;
  didAutoFallback: boolean;

  loadModel: (modelId: string) => Promise<void>;
  unloadModel: () => Promise<void>;
  generate: (messages: Message[], signal?: AbortSignal) => Promise<string>;
  interrupt: () => void;
  retry: () => void;
  deleteModelFiles: (modelId: string) => Promise<void>;
}

let llmInstance: LLMModule | null = null;
let loadOperationId = 0;

export const useLlmStore = create<LlmState>()((set, get) => ({
  isReady: false,
  isGenerating: false,
  isLoading: false,
  loadingPhase: 'idle' as LoadingPhase,
  downloadProgress: 0,
  error: null,
  errorKind: null,
  loadedModelId: null,
  didAutoFallback: false,

  loadModel: async (modelId: string) => {
    const model = LOCAL_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    const thisOpId = ++loadOperationId;

    // Release previous model — wait for generation to stop
    await get().unloadModel();

    set({
      isLoading: true,
      isReady: false,
      error: null,
      errorKind: null,
      downloadProgress: 0,
      loadingPhase: 'downloading',
    });

    const instance = new LLMModule();

    if (thisOpId !== loadOperationId) {
      try {
        instance.delete();
      } catch {
        /* ignore */
      }
      return;
    }
    llmInstance = instance;

    try {
      await instance.load(
        model.modelSource as Parameters<LLMModule['load']>[0],
        (progress: number) => {
          if (thisOpId === loadOperationId) {
            set({
              downloadProgress: progress,
              loadingPhase: progress >= 1 ? 'initializing' : 'downloading',
            });
          }
        },
      );

      if (thisOpId !== loadOperationId) {
        try {
          instance.delete();
        } catch {
          /* ignore */
        }
        return;
      }

      // Configure generation parameters
      instance.configure({ generationConfig: { temperature: 0.7 } });

      set({
        isReady: true,
        isLoading: false,
        loadingPhase: 'idle',
        loadedModelId: modelId,
      });
    } catch (err) {
      if (thisOpId !== loadOperationId) {
        try {
          instance.delete();
        } catch {
          /* ignore */
        }
        return;
      }

      const classified = classifyError(err);
      set({
        isLoading: false,
        loadingPhase: 'idle',
        error: classified.message,
        errorKind: classified.kind,
        loadedModelId: null,
      });
      // Auto-fallback na cloud
      useAiSettingsStore.getState().setAiProvider('cloud');
      set({ didAutoFallback: true });

      try {
        instance.delete();
      } catch {
        /* ignore */
      }
      llmInstance = null;
    }
  },

  unloadModel: async () => {
    if (llmInstance) {
      // Interrupt any in-flight generation
      try {
        llmInstance.interrupt();
      } catch {
        // Model może nie generować — ignoruj
      }

      // Wait for generation to actually stop before deleting
      await waitForGenerationStop(() => get().isGenerating);

      // Release native resources
      try {
        llmInstance.delete();
      } catch {
        // Model może być już usunięty — ignoruj
      }
      llmInstance = null;
    }
    set({
      isReady: false,
      isGenerating: false,
      isLoading: false,
      loadingPhase: 'idle',
      downloadProgress: 0,
      loadedModelId: null,
      // Don't clear error/errorKind — they're cleared by loadModel/retry
    });
  },

  generate: async (messages, signal) => {
    const instance = llmInstance;
    if (!instance || !get().isReady) {
      throw new Error('Model nie jest gotowy');
    }
    if (signal?.aborted) throw new Error('Anulowano');

    const onAbort = () => {
      try {
        instance.interrupt();
      } catch {
        // ignore
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    set({ isGenerating: true });
    try {
      const response = await instance.generate(messages);
      if (!response) throw new Error('Model zwrócił pustą odpowiedź');
      return response;
    } catch (err) {
      const classified = classifyError(err);
      set({ error: classified.message, errorKind: classified.kind });
      throw err;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      set({ isGenerating: false });
    }
  },

  interrupt: () => {
    try {
      llmInstance?.interrupt();
    } catch {
      // ignore
    }
  },

  retry: () => {
    set({ didAutoFallback: false, error: null, errorKind: null });
    // Setting provider to 'local' triggers the subscription in _layout.tsx
    // which calls loadModel — no need to call it directly here
    useAiSettingsStore.getState().setAiProvider('local');
  },

  deleteModelFiles: async (modelId: string) => {
    const model = LOCAL_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    if (get().loadedModelId === modelId) {
      await get().unloadModel();
    }

    set({ didAutoFallback: false });

    try {
      const urls = [
        model.modelSource.modelSource,
        model.modelSource.tokenizerSource,
        model.modelSource.tokenizerConfigSource,
      ].filter((u): u is string => typeof u === 'string');
      await ResourceFetcher.deleteResources(...urls);
    } catch {
      // Model mógł nie być pobrany
    }
  },
}));
