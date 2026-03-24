import { useAiSettingsStore } from '@/store/aiSettingsStore';
import type { AiProvider } from '../types';
import { cloudProvider } from './cloud';
import { createLocalProvider } from './local';

export function getProvider(): AiProvider {
  const { aiProvider, localModelId } = useAiSettingsStore.getState();

  if (aiProvider === 'local') {
    return createLocalProvider(localModelId);
  }

  return cloudProvider;
}

export function getActiveProviderName(): 'cloud' | 'local' {
  return useAiSettingsStore.getState().aiProvider;
}
