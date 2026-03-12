import { create } from 'zustand';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  photo: string | null;
  idToken: string | null;
}

interface AuthState {
  user: GoogleUser | null;
  isAuthenticated: boolean;
  setUser: (user: GoogleUser) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  clearUser: () => set({ user: null, isAuthenticated: false }),
}));
