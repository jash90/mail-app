import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

interface PolishVoiceState {
  selectedVoiceId: string | null;
  setSelectedVoiceId: (id: string | null) => void;
}

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const usePolishVoiceStore = create<PolishVoiceState>()(
  persist(
    (set) => ({
      selectedVoiceId: null,
      setSelectedVoiceId: (id) => set({ selectedVoiceId: id }),
    }),
    {
      name: 'polish-voice-store',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
