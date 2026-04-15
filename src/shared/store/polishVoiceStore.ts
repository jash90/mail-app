import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from './secureStorage';

interface PolishVoiceState {
  selectedVoiceId: string | null;
  setSelectedVoiceId: (id: string | null) => void;
}

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
