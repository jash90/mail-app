import type { ChatMessage } from './types';

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';
if (__DEV__ && !ZAI_API_KEY) {
  console.warn(
    '[AI] EXPO_PUBLIC_ZAI_API_KEY is not set — AI features will fail',
  );
}
const ZAI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

interface ZaiResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export async function chatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  // Link external signal to internal controller
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4.7-flashx',
        messages,
        temperature: 0.7
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Z.AI returned empty response');
    return content;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
