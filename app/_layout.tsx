import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import '../global.css';

import { initSentry, Sentry, navigationIntegration } from '@/lib/sentry';
initSentry();

import { useAuthStore } from '@/store/authStore';
import { initializeTokens } from '@/features/auth/oauthService';
import { db } from '@/db/client';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAiSettingsStore } from '@/store/aiSettingsStore';
import { useLlmStore } from '@/store/llmStore';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '@/lib/posthog';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Text, View } from 'react-native';
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

  useEffect(() => {
    if (isAuthenticated) {
      initializeTokens().catch(console.error);
    }
  }, [isAuthenticated]);

  // Sync local LLM model z aiSettingsStore
  useEffect(() => {
    const LOCAL_MODELS_ENABLED =
      process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

    if (!LOCAL_MODELS_ENABLED) {
      if (useAiSettingsStore.getState().aiProvider === 'local') {
        useAiSettingsStore.getState().setAiProvider('cloud');
      }
      return;
    }

    const { aiProvider, localModelId } = useAiSettingsStore.getState();
    if (aiProvider === 'local') {
      useLlmStore.getState().loadModel(localModelId);
    }

    const unsub = useAiSettingsStore.subscribe((state, prev) => {
      if (
        state.aiProvider === 'local' &&
        (state.localModelId !== prev.localModelId ||
          state.aiProvider !== prev.aiProvider)
      ) {
        useLlmStore.getState().loadModel(state.localModelId);
      }
      if (state.aiProvider !== 'local' && prev.aiProvider === 'local') {
        useLlmStore.getState().unloadModel();
      }
    });

    return unsub;
  }, []);

  // Unload LLM on background to prevent Jetsam kills, reload on foreground
  const wasUnloadedForBackground = useRef(false);
  useEffect(() => {
    const LOCAL_MODELS_ENABLED =
      process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';
    if (!LOCAL_MODELS_ENABLED) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      const { aiProvider, localModelId } = useAiSettingsStore.getState();

      if (nextState === 'background' || nextState === 'inactive') {
        if (aiProvider === 'local' && useLlmStore.getState().loadedModelId) {
          useLlmStore.getState().interrupt();
          useLlmStore.getState().unloadModel();
          wasUnloadedForBackground.current = true;
        }
      } else if (nextState === 'active' && wasUnloadedForBackground.current) {
        wasUnloadedForBackground.current = false;
        if (aiProvider === 'local') {
          useLlmStore.getState().loadModel(localModelId);
        }
      }
    });

    return () => sub.remove();
  }, []);

  // Unload LLM on iOS memory warning to prevent Hermes OOM crash
  useEffect(() => {
    const LOCAL_MODELS_ENABLED =
      process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';
    if (!LOCAL_MODELS_ENABLED) return;

    const sub = AppState.addEventListener('memoryWarning', () => {
      const { loadedModelId } = useLlmStore.getState();
      if (loadedModelId) {
        console.warn('[LLM] Memory warning — unloading model to free RAM');
        useLlmStore.getState().interrupt();
        useLlmStore.getState().unloadModel();
        useAiSettingsStore.getState().setAiProvider('cloud');
        useLlmStore.setState({ didAutoFallback: true });
      }
    });

    return () => sub.remove();
  }, []);

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
