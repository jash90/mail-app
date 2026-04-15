import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore adapter for Zustand persist middleware.
 * Shared across all stores — single source of truth for the storage interface.
 */
export const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};
