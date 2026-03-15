import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export type AiProviderType = 'cloud' | 'local' | 'auto';
export type ModelStatus =
  | 'not-downloaded'
  | 'downloading'
  | 'downloaded'
  | 'loading'
  | 'ready'
  | 'error';

interface AiSettingsState {
  provider: AiProviderType;
  selectedModelId: string;
  modelStatus: ModelStatus;
  downloadProgress: number;
  error: string | null;
  wantsDownload: boolean;
  setProvider: (provider: AiProviderType) => void;
  setSelectedModelId: (modelId: string) => void;
  setModelStatus: (status: ModelStatus) => void;
  setDownloadProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  setWantsDownload: (wants: boolean) => void;
}

const secureStorage = createJSONStorage<AiSettingsState>(() => ({
  getItem: (key: string) => SecureStore.getItem(key),
  setItem: (key: string, value: string) => SecureStore.setItem(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}));

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      provider: 'auto',
      selectedModelId: 'qwen3-0.6b',
      modelStatus: 'not-downloaded',
      downloadProgress: 0,
      error: null,
      wantsDownload: false,
      setProvider: (provider) => set({ provider }),
      setSelectedModelId: (selectedModelId) =>
        set({ selectedModelId, wantsDownload: false }),
      setModelStatus: (modelStatus) => set({ modelStatus }),
      setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
      setError: (error) => set({ error }),
      setWantsDownload: (wantsDownload) => set({ wantsDownload }),
    }),
    {
      name: 'ai-settings',
      storage: secureStorage,
      partialize: (state) =>
        ({
          provider: state.provider,
          selectedModelId: state.selectedModelId,
        }) as AiSettingsState,
    },
  ),
);
