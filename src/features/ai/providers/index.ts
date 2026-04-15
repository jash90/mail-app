import { useAiSettingsStore } from '@/src/shared/store/aiSettingsStore';
import type { AiProvider } from '../types';
import { anonymizingCloudProvider } from './anonymizingCloud';
import { createLocalProvider, releaseLocalProvider } from './local';

const LOCAL_MODELS_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_MODELS_ENABLED === 'true';

export function getProvider(): AiProvider {
  const { aiProvider, localModelId } = useAiSettingsStore.getState();

  if (LOCAL_MODELS_ENABLED && aiProvider === 'local') {
    return createLocalProvider(localModelId);
  }

  // Cloud path always goes through the anonymization wrapper — every
  // outgoing payload is regex-stripped + quote-stripped + NER'd, and the
  // post-pipeline re-scan hard-fails any structured PII leak.
  return anonymizingCloudProvider;
}

export function getActiveProviderName(): 'cloud' | 'local' {
  return useAiSettingsStore.getState().aiProvider;
}

export { releaseLocalProvider };
