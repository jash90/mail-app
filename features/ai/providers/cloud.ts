import type { AiProvider, ChatMessage } from '../types';
import { chatCompletion } from '../cloud-api';

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async generate(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    return chatCompletion(messages, signal);
  },
};
