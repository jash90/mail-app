import '@/lib/polyfills';
import '../global.css';

import { initSentry, Sentry, navigationIntegration } from '@/lib/sentry';
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
import { Pressable, Text, View } from 'react-native';
import 'react-native-reanimated';
import Icon from '@expo/vector-icons/SimpleLineIcons';

initSentry();

export { default as ErrorBoundary } from '@/components/ErrorScreen';

const centeredContainerStyle = {
  flex: 1,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  backgroundColor: '#000',
};

function RootErrorFallback({
  resetError,
}: {
  error: unknown;
  componentStack: string;
  eventId: string;
  resetError: () => void;
}) {
  return (
    <View style={{ ...centeredContainerStyle, paddingHorizontal: 24, gap: 12 }}>
      <View
        style={{
          backgroundColor: 'rgba(248,113,113,0.08)',
          borderRadius: 999,
          padding: 16,
          marginBottom: 8,
        }}
      >
        <Icon name="exclamation" size={32} color="#f87171" />
      </View>
      <Text style={{ color: '#f87171', fontSize: 18, fontWeight: '600' }}>
        Something went wrong
      </Text>
      <Text
        style={{
          color: '#a1a1aa',
          fontSize: 14,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        An unexpected error occurred. Try restarting the screen.
      </Text>
      <Pressable
        onPress={resetError}
        style={{
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 12,
          paddingHorizontal: 24,
          paddingVertical: 14,
          marginTop: 8,
          width: '100%',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

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
    <Sentry.ErrorBoundary fallback={RootErrorFallback}>
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
              <Stack.Screen name="ai-tokens" options={{ headerShown: false }} />
              <Stack.Screen
                name="contact-tiers"
                options={{ headerShown: false }}
              />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </PostHogProvider>
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
