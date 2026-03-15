import type { AiProvider, ChatMessage } from '../types';
import type { Message } from 'react-native-executorch';

type GenerateFn = (messages: Message[]) => Promise<string>;

let generateFn: GenerateFn | null = null;

export function registerLocalGenerate(fn: GenerateFn | null) {
  generateFn = fn;
}

export const localProvider: AiProvider = {
  name: 'local',

  async isAvailable() {
    return generateFn !== null;
  },

  async generate(messages: ChatMessage[]): Promise<string> {
    if (!generateFn) {
      throw new Error('Local model not loaded');
    }

    const mapped: Message[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return generateFn(mapped);
  },
};
