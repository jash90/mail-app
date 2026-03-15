import { useAiSettingsStore } from '@/store/aiSettingsStore';
import type { AiProvider, ChatMessage } from '../types';
import { cloudProvider } from './cloud';

let localProviderInstance: AiProvider | null = null;

export function setLocalProvider(provider: AiProvider) {
  localProviderInstance = provider;
}

export function clearLocalProvider() {
  localProviderInstance = null;
}

export function getProvider(): AiProvider {
  const { provider: preference, modelStatus } = useAiSettingsStore.getState();

  if (
    preference === 'local' &&
    localProviderInstance &&
    modelStatus === 'ready'
  ) {
    return localProviderInstance;
  }

  if (
    preference === 'auto' &&
    localProviderInstance &&
    modelStatus === 'ready'
  ) {
    return localProviderInstance;
  }

  return cloudProvider;
}

export function getActiveProviderName(): 'cloud' | 'local' {
  return getProvider().name;
}

/**
 * Generate with auto-fallback: if local provider fails, retry with cloud.
 */
export async function generateWithFallback(
  messages: ChatMessage[],
): Promise<string> {
  const provider = getProvider();

  try {
    return await provider.generate(messages);
  } catch (error) {
    if (provider.name === 'local') {
      console.warn('[AI] Local model failed, falling back to cloud:', error);
      return cloudProvider.generate(messages);
    }
    throw error;
  }
}
