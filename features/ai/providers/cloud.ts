import type { AiProvider, ChatMessage } from '../types';
import { chatCompletion } from '../api';

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async generate(messages: ChatMessage[]): Promise<string> {
    return chatCompletion(messages);
  },
};
