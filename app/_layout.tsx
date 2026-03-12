import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createMMKVPersister } from '@/features/gmail/persister';
import { Stack, useRouter } from 'expo-router';
import 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { getStoredTokens } from '@/features/auth/oauthService';
import { useEffect } from 'react';

const FIVE_MINUTES = 5 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: FIVE_MINUTES,
    },
  },
});

const persister = createMMKVPersister();

export default function RootLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const setUser = useAuthStore(s => s.setUser);

  useEffect(() => {
    (async () => {
      const tokens = await getStoredTokens('gmail');
      if (!tokens) {
        router.replace("/login");
      } else if (tokens.user?.id) {
        setUser(tokens.user);
        router.replace("/list");
      }
    })();
  }, []);


  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: FIVE_MINUTES }}
    >
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="list" options={{ headerShown: false }} />
          <Stack.Screen name="compose" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </PersistQueryClientProvider>
  );
}
