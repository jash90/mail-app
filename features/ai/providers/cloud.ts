import type { AiProvider, ChatMessage } from '../types';
import { chatCompletion } from '../api';

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async isAvailable() {
    return ZAI_API_KEY.length > 0;
  },

  async generate(messages: ChatMessage[]): Promise<string> {
    return chatCompletion(messages);
  },
};
