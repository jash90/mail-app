import type { ChatMessage } from './types';
import { AI } from '@/config/constants';

// SECURITY: EXPO_PUBLIC_ vars are embedded in the JS bundle.
// Acceptable for personal use; production apps should proxy through a backend.
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
  const timeout = setTimeout(() => controller.abort(), AI.timeoutMs);

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
        model: AI.model,
        messages,
        temperature: AI.temperature,
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
