import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from './secureStorage';

interface AiSettingsState {
  aiProvider: 'cloud' | 'local';
  localModelId: string;
  setAiProvider: (provider: 'cloud' | 'local') => void;
  setLocalModelId: (id: string) => void;
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      aiProvider: 'cloud',
      localModelId: 'llama3.2-3b',
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setLocalModelId: (localModelId) => set({ localModelId }),
    }),
    {
      name: 'ai-settings-store',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
