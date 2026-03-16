import type { AiProvider } from '../types';
import { cloudProvider } from './cloud';

export function getProvider(): AiProvider {
  return cloudProvider;
}

export function getActiveProviderName(): 'cloud' {
  return 'cloud';
}
