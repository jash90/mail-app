import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { prefetchSummaries } from '@/features/ai/api';
import { getActiveProviderName } from '@/features/ai/providers';
import { getStoredTokens } from '@/features/auth/oauthService';
import { useAuthStore } from '@/store/authStore';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import { db } from '@/db/client';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import 'react-native-reanimated';
import { LocalAIProvider } from '@/features/ai/local/LocalAIProvider';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: TWENTY_FOUR_HOURS,
    },
  },
});

export default function RootLayout() {
  const { success: migrationSuccess, error: migrationError } = useMigrations(db, migrations);
  const router = useRouter();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const setUser = useAuthStore(s => s.setUser);

  useEffect(() => {
    if (!migrationSuccess) return;

    (async () => {
      const tokens = await getStoredTokens('gmail');
      if (tokens?.user?.id) {
        setUser(tokens?.user);
        setTimeout(() => router.replace('/(tabs)/list'), 200);
        const activeProvider = getActiveProviderName();
        if (activeProvider === 'cloud') {
          prefetchSummaries(tokens.user.id).catch(() => {});
        }
      } else {
        setTimeout(() => router.replace('/login'), 200);
      }
    })();
  }, [migrationSuccess]);

  if (migrationError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <Text style={{ color: '#f87171' }}>Database error: {migrationError.message}</Text>
      </View>
    );
  }

  if (!migrationSuccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <Text style={{ color: '#a1a1aa' }}>Initializing...</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <LocalAIProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Protected guard={isAuthenticated}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="compose" options={{ headerShown: false }} />
            <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="summary" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </LocalAIProvider>
    </QueryClientProvider>
  );
}
