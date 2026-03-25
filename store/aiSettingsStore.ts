import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

type ModelSwitchPhase = 'idle' | 'unloading' | 'loading';

interface AiSettingsState {
  aiProvider: 'cloud' | 'local';
  localModelId: string;
  modelSwitchPhase: ModelSwitchPhase;
  setAiProvider: (provider: 'cloud' | 'local') => void;
  setLocalModelId: (id: string) => void;
  setModelSwitchPhase: (phase: ModelSwitchPhase) => void;
}

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      aiProvider: 'cloud',
      localModelId: 'bielik-1.5b',
      modelSwitchPhase: 'idle' as ModelSwitchPhase,
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setLocalModelId: (localModelId) => set({ localModelId }),
      setModelSwitchPhase: (modelSwitchPhase) => set({ modelSwitchPhase }),
    }),
    {
      name: 'ai-settings-store',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        aiProvider: state.aiProvider,
        localModelId: state.localModelId,
      }),
    },
  ),
);
