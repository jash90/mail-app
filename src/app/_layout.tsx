import '@/src/shared/services/polyfills';
import '../../global.css';

import {
  initSentry,
  Sentry,
  navigationIntegration,
} from '@/src/shared/services/sentry';
import { useAuthStore } from '@/src/shared/store/authStore';
import { initializeTokens } from '@/src/features/auth/services/oauthService';
import {
  startSyncManager,
  stopSyncManager,
  setOnFtsRebuilt,
} from '@/src/features/gmail/services/syncManager';
import { db, useMigrations, migrations } from '@/src/shared/db';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/src/shared/services/queryClient';
import { registerLocalAICheck } from '@/src/shared/services/resourceLock';
import { getActiveProviderName } from '@/src/features/ai/providers';
import { resetFTSVerification } from '@/src/features/search';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '@/src/shared/services/posthog';

/** No-op wrapper when PostHog is not configured (missing API key) */
const SafePostHogProvider = posthog
  ? ({ children }: { children: React.ReactNode }) => (
      <PostHogProvider client={posthog}>{children}</PostHogProvider>
    )
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;
import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import 'react-native-reanimated';
import Icon from '@expo/vector-icons/SimpleLineIcons';

initSentry();

// Register local AI check so resourceLock can coordinate AI/network without coupling to features/ai
registerLocalAICheck(() => getActiveProviderName() === 'local');

// Wire search-feature callback into sync manager without creating cross-feature import
setOnFtsRebuilt(resetFTSVerification);

export { default as ErrorBoundary } from '@/src/shared/components/ErrorScreen';

function RootErrorFallback({
  resetError,
}: {
  error: unknown;
  componentStack: string;
  eventId: string;
  resetError: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-black px-6">
      <View className="mb-2 rounded-full bg-red-400/[0.08] p-4">
        <Icon name="exclamation" size={32} color="#f87171" />
      </View>
      <Text className="text-lg font-semibold text-red-400">
        Something went wrong
      </Text>
      <Text className="text-center text-sm leading-5 text-zinc-400">
        An unexpected error occurred. Try restarting the screen.
      </Text>
      <Pressable
        onPress={resetError}
        className="mt-2 w-full items-center rounded-xl bg-white/10 px-6 py-3.5"
      >
        <Text className="text-sm font-medium text-white">Try again</Text>
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
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-red-400">
          Database error: {migrationError.message}
        </Text>
      </View>
    );
  }

  if (!migrationSuccess) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-zinc-400">Initializing...</Text>
      </View>
    );
  }

  return (
    <Sentry.ErrorBoundary fallback={RootErrorFallback}>
      <SafePostHogProvider>
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
      </SafePostHogProvider>
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
