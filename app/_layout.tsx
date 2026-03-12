import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { getStoredTokens } from '@/features/auth/oauthService';
import { createMMKVPersister } from '@/features/gmail/persister';
import { useAuthStore } from '@/store/authStore';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import 'react-native-reanimated';

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
      if (tokens?.user?.id) {
        setUser(tokens?.user);
        setTimeout(() => router.replace('/list'), 200);
      } else {
        setTimeout(() => router.replace('/login'), 200);
      }
    })();
  });


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
