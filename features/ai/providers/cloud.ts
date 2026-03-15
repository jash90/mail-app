import type { AiProvider, ChatMessage } from '../types';

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';
const ZAI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

interface ZaiResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export const cloudProvider: AiProvider = {
  name: 'cloud',

  async isAvailable() {
    return ZAI_API_KEY.length > 0;
  },

  async generate(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ZAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-5',
          messages,
          temperature: 0.7,
          max_tokens: 16384,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error.error?.message || `Z.AI API error: ${response.status}`,
        );
      }

      const data: ZaiResponse = await response.json();
      return data.choices[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeout);
    }
  },
};
