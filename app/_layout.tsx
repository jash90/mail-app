import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { useAuthStore } from '@/store/authStore';
import { db } from '@/db/client';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import 'react-native-reanimated';
import { LocalAIProvider } from '@/features/ai/local/LocalAIProvider';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const centeredContainerStyle = {
  flex: 1,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  backgroundColor: '#000',
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: TWENTY_FOUR_HOURS,
    },
  },
});

export default function RootLayout() {
  const { success: migrationSuccess, error: migrationError } = useMigrations(
    db,
    migrations,
  );
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (migrationError) {
    return (
      <View style={centeredContainerStyle}>
        <Text style={{ color: '#f87171' }}>
          Database error: {migrationError.message}
        </Text>
      </View>
    );
  }

  if (!migrationSuccess) {
    return (
      <View style={centeredContainerStyle}>
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
