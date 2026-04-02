import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { initSentry, Sentry, navigationIntegration } from '@/lib/sentry';
initSentry();

import { useAuthStore } from '@/store/authStore';
import { initializeTokens } from '@/features/auth/oauthService';
import {
  startSyncManager,
  stopSyncManager,
} from '@/features/gmail/syncManager';
import { db } from '@/db/client';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '@/lib/posthog';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import 'react-native-reanimated';

const centeredContainerStyle = {
  flex: 1,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  backgroundColor: '#000',
};

function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  const { success: migrationSuccess, error: migrationError } = useMigrations(
    db,
    migrations,
  );
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      initializeTokens()
        .then(() => startSyncManager(user.id))
        .catch(console.error);
    } else {
      stopSyncManager();
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (migrationError) {
      Sentry.captureException(migrationError);
    }
  }, [migrationError]);

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
    <Sentry.ErrorBoundary
      fallback={
        <View style={centeredContainerStyle}>
          <Text style={{ color: '#f87171', fontSize: 16 }}>
            Unexpected error occurred
          </Text>
        </View>
      }
    >
      <PostHogProvider client={posthog}>
        <QueryClientProvider client={queryClient}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Protected guard={isAuthenticated}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="compose" options={{ headerShown: false }} />
              <Stack.Screen
                name="thread/[id]"
                options={{ headerShown: false }}
              />
              <Stack.Screen name="summary" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </PostHogProvider>
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
