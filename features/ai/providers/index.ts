import { useAiSettingsStore } from '@/store/aiSettingsStore';
import type { AiProvider } from '../types';
import { cloudProvider } from './cloud';
import { createLocalProvider } from './local';

const LOCAL_MODELS_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

export function getProvider(): AiProvider {
  const { aiProvider, localModelId } = useAiSettingsStore.getState();

  if (LOCAL_MODELS_ENABLED && aiProvider === 'local') {
    return createLocalProvider(localModelId);
  }

  return cloudProvider;
}

export function getActiveProviderName(): 'cloud' | 'local' {
  return useAiSettingsStore.getState().aiProvider;
}
