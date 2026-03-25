import { create } from 'zustand';
import {
  LLMModule,
  ResourceFetcher,
  type Message,
} from 'react-native-executorch';
import { LOCAL_MODELS } from '@/features/ai/types';
import { useAiSettingsStore } from './aiSettingsStore';

export type ModelErrorKind = 'download' | 'memory' | 'generation' | 'unknown';

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

interface LlmState {
  isReady: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  downloadProgress: number;
  error: string | null;
  errorKind: ModelErrorKind | null;
  loadedModelId: string | null;
  didAutoFallback: boolean;

  loadModel: (modelId: string) => Promise<void>;
  unloadModel: () => void;
  generate: (messages: Message[], signal?: AbortSignal) => Promise<string>;
  interrupt: () => void;
  retry: () => void;
  deleteModelFiles: (modelId: string) => Promise<void>;
}

let llmInstance: LLMModule | null = null;

export const useLlmStore = create<LlmState>()((set, get) => ({
  isReady: false,
  isGenerating: false,
  isLoading: false,
  downloadProgress: 0,
  error: null,
  errorKind: null,
  loadedModelId: null,
  didAutoFallback: false,

  loadModel: async (modelId: string) => {
    const model = LOCAL_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    // Zwolnij poprzedni model synchronicznie — zapobiega OOM
    get().unloadModel();

    set({
      isLoading: true,
      isReady: false,
      error: null,
      errorKind: null,
      downloadProgress: 0,
    });

    llmInstance = new LLMModule();

    try {
      await llmInstance.load(
        model.modelSource as Parameters<LLMModule['load']>[0],
        (progress: number) => {
          set({ downloadProgress: progress });
        },
      );
      set({ isReady: true, isLoading: false, loadedModelId: modelId });
    } catch (err) {
      const classified = classifyError(err);
      set({
        isLoading: false,
        error: classified.message,
        errorKind: classified.kind,
        loadedModelId: null,
      });
      // Auto-fallback na cloud
      useAiSettingsStore.getState().setAiProvider('cloud');
      set({ didAutoFallback: true });
      // Cleanup failed instance
      try {
        llmInstance?.delete();
      } catch {
        // ignore
      }
      llmInstance = null;
    }
  },

  unloadModel: () => {
    if (llmInstance) {
      try {
        llmInstance.interrupt();
      } catch {
        // Model może nie generować — ignoruj
      }
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
      downloadProgress: 0,
      loadedModelId: null,
    });
  },

  generate: async (messages, signal) => {
    if (!llmInstance || !get().isReady) {
      throw new Error('Model nie jest gotowy');
    }
    if (signal?.aborted) throw new Error('Anulowano');

    const onAbort = () => {
      try {
        llmInstance?.interrupt();
      } catch {
        // ignore
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    set({ isGenerating: true });
    try {
      const response = await llmInstance.generate(messages);
      if (!response) throw new Error('Model zwrócił pustą odpowiedź');
      return response;
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
    const { localModelId } = useAiSettingsStore.getState();
    useAiSettingsStore.getState().setAiProvider('local');
    set({ didAutoFallback: false, error: null, errorKind: null });
    get().loadModel(localModelId);
  },

  deleteModelFiles: async (modelId: string) => {
    const model = LOCAL_MODELS.find((m) => m.id === modelId);
    if (!model) return;
    try {
      await ResourceFetcher.deleteResources(model.modelSource);
    } catch {
      // Model mógł nie być pobrany
    }
  },
}));
