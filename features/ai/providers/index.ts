import { useAiSettingsStore } from '@/store/aiSettingsStore';
import type { AiProvider } from '../types';
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
    (preference === 'local' || preference === 'auto') &&
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

