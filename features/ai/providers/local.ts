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
      return useLlmStore.getState().generate(messages as Message[], signal);
    },
  };
}
