import type { ChatMessage } from '../types';
import { AI } from '@/src/shared/config/constants';
import { AIProviderError } from '@/src/shared/services/errors';
import {
  TOKEN_TRACKING_ENABLED,
  recordTokenUsage,
  estimateTokens,
  type AiOperation,
} from './tokenTracker';

// ── API Keys ──────────────────────────────────────────────────────────

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';

if (__DEV__) {
  if (AI.backend === 'zai' && !ZAI_API_KEY) {
    console.warn(
      '[AI] EXPO_PUBLIC_ZAI_API_KEY is not set — Z.AI calls will fail',
    );
  }
  if (AI.backend === 'openrouter' && !OPENROUTER_API_KEY) {
    console.warn(
      '[AI] EXPO_PUBLIC_OPENROUTER_API_KEY is not set — OpenRouter calls will fail',
    );
  }
}

// ── Response type ─────────────────────────────────────────────────────

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// ── Z.AI error handling ───────────────────────────────────────────────

const ZAI_ERROR_MAP: Record<string, string> = {
  '1113': 'Z.AI account has insufficient balance. Please recharge at z.ai.',
  '1110': 'Z.AI API key is invalid or expired.',
  '1111': 'Z.AI API key is disabled.',
  '1112': 'Z.AI API rate limit exceeded. Please try again later.',
  '1214': 'Z.AI model not found or access denied.',
  '1200': 'Z.AI request format error.',
  '1261': 'Z.AI content moderation triggered. Input may violate policy.',
  '1300': 'Z.AI system is busy. Please try again later.',
};

function resolveZaiErrorMessage(
  code: string | undefined,
  originalMessage: string | undefined,
  status: number,
): string {
  if (code && ZAI_ERROR_MAP[code]) return ZAI_ERROR_MAP[code];
  if (originalMessage && /[\u4e00-\u9fff]/.test(originalMessage)) {
    return `Z.AI API error (code ${code ?? status}): request failed. Check your Z.AI account.`;
  }
  return originalMessage || `Z.AI API error: ${status}`;
}

// ── Backend config resolver ───────────────────────────────────────────

function getBackendConfig(): {
  url: string;
  model: string;
  headers: Record<string, string>;
  label: string;
} {
  if (AI.backend === 'openrouter') {
    return {
      url: `${AI.openrouter.baseUrl}/chat/completions`,
      model: AI.openrouter.model,
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'com.jash.mail-app',
        'X-Title': 'Mail App',
      },
      label: 'OpenRouter',
    };
  }

  return {
    url: `${AI.zai.baseUrl}/chat/completions`,
    model: AI.zai.model,
    headers: {
      Authorization: `Bearer ${ZAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    label: 'Z.AI',
  };
}

// ── Parse error response ──────────────────────────────────────────────

function parseErrorMessage(
  body: Record<string, unknown>,
  status: number,
  label: string,
): string {
  const err = body.error as
    | { code?: string; message?: string; type?: string }
    | undefined;

  if (label === 'Z.AI') {
    return resolveZaiErrorMessage(err?.code, err?.message, status);
  }

  // OpenRouter uses standard OpenAI error format
  if (err?.message) return `${label}: ${err.message}`;
  return `${label} API error: ${status}`;
}

// ── Main completion function ──────────────────────────────────────────

export async function chatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
  operation: AiOperation = 'compose',
): Promise<string> {
  const config = getBackendConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI.timeoutMs);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: AI.temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = parseErrorMessage(
        body as Record<string, unknown>,
        response.status,
        config.label,
      );
      throw new AIProviderError('API_ERROR', msg);
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIProviderError(
        'EMPTY_RESPONSE',
        `${config.label} returned empty response`,
      );
    }

    if (TOKEN_TRACKING_ENABLED) {
      const promptText = messages.map((m) => m.content).join('');
      const promptTokens =
        data.usage?.prompt_tokens ?? estimateTokens(promptText);
      const completionTokens =
        data.usage?.completion_tokens ?? estimateTokens(content);
      recordTokenUsage({
        provider: AI.backend,
        model: config.model,
        operation,
        promptTokens,
        completionTokens,
        totalTokens:
          data.usage?.total_tokens ?? promptTokens + completionTokens,
      });
    }

    return content;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
