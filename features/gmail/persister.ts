import { createMMKV } from 'react-native-mmkv';
import type { Persister } from '@tanstack/react-query-persist-client';

const STORAGE_KEY = 'react-query-cache';

const mmkv = createMMKV({ id: 'query-cache' });

export function createMMKVPersister(): Persister {
  return {
    persistClient: (client) => {
      mmkv.set(STORAGE_KEY, JSON.stringify(client));
    },
    restoreClient: () => {
      const data = mmkv.getString(STORAGE_KEY);
      if (!data) return undefined;
      try {
        return JSON.parse(data);
      } catch {
        return undefined;
      }
    },
    removeClient: () => {
      mmkv.remove(STORAGE_KEY);
    },
  };
}
