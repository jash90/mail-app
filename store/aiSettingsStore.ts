import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

interface AiSettingsState {
  aiProvider: 'cloud' | 'local';
  localModelId: string;
  setAiProvider: (provider: 'cloud' | 'local') => void;
  setLocalModelId: (id: string) => void;
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
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setLocalModelId: (localModelId) => set({ localModelId }),
    }),
    {
      name: 'ai-settings-store',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
