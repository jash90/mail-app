import { localLLMBridge } from '../LocalLLMContext';
import type { AiProvider, ChatMessage } from '../types';

export function createLocalProvider(): AiProvider {
  return {
    name: 'local',

    async generate(
      messages: ChatMessage[],
      signal?: AbortSignal,
    ): Promise<string> {
      if (!localLLMBridge.generate) {
        throw new Error(
          'Lokalny model nie jest zainicjalizowany. ' +
            'Upewnij się, że LocalLLMProvider jest zamontowany.',
        );
      }
      return localLLMBridge.generate(messages, signal);
    },
  };
}

export async function releaseLocalProvider(): Promise<void> {
  localLLMBridge.interrupt?.();
}
