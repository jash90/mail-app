import type { AiProvider, ChatMessage, GenerateOptions } from '../types';
import { chatCompletion } from '../services/cloud-api';

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async generate(
    messages: ChatMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    return chatCompletion(messages, options?.signal, options?.operation);
  },
};
