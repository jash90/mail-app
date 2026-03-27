import { useLlmStore } from '@/store/llmStore';
import type { AiProvider, ChatMessage } from '../types';
import type { Message } from 'react-native-executorch';

export function createLocalProvider(): AiProvider {
  return {
    name: 'local',
    async generate(
      messages: ChatMessage[],
      signal?: AbortSignal,
    ): Promise<string> {
      const { isReady, isLoading, error } = useLlmStore.getState();

      if (!isReady) {
        if (isLoading) {
          throw new Error('Model is still loading. Please wait.');
        }
        if (error) {
          throw new Error(`Model failed to load: ${error}`);
        }
        throw new Error('Local model is not loaded. Select a model first.');
      }

      return useLlmStore.getState().generate(messages as Message[], signal);
    },
  };
}
