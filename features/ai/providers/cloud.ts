import type { AiProvider, ChatMessage } from '../types';
import { chatCompletion } from '../cloud-api';
import type { AiOperation } from '../tokenTracker';

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async generate(
    messages: ChatMessage[],
    signal?: AbortSignal,
    operation?: AiOperation,
  ): Promise<string> {
    return chatCompletion(messages, signal, operation);
  },
};
