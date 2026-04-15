import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import { getModelFilePath } from '../services/modelDownloader';
import type { AiProvider, ChatMessage } from '../types';
import {
  TOKEN_TRACKING_ENABLED,
  recordTokenUsage,
  estimateTokens,
  type AiOperation,
} from '../services/tokenTracker';

let cachedContext: LlamaContext | null = null;
let cachedModelId: string | null = null;

async function getContext(modelId: string): Promise<LlamaContext> {
  if (cachedContext && cachedModelId === modelId) return cachedContext;

  // Release previous context if switching models
  if (cachedContext) {
    await releaseAllLlama();
    cachedContext = null;
    cachedModelId = null;
  }

  const modelPath = getModelFilePath(modelId);
  if (!modelPath) throw new Error(`Nieznany model: ${modelId}`);

  cachedContext = await initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_gpu_layers: 99,
  });
  cachedModelId = modelId;
  return cachedContext;
}

export function createLocalProvider(modelId: string): AiProvider {
  return {
    name: 'local',

    async generate(
      messages: ChatMessage[],
      signal?: AbortSignal,
      operation?: AiOperation,
    ): Promise<string> {
      const context = await getContext(modelId);

      const oaiMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let stopped = false;
      const onAbort = () => {
        stopped = true;
        context.stopCompletion();
      };
      if (signal) {
        if (signal.aborted) throw new Error('Anulowano');
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        const result = await context.completion(
          {
            messages: oaiMessages,
            n_predict: 512,
            temperature: 0.7,
            stop: ['<|end|>', '</s>', '<|eot_id|>', '<|im_end|>'],
          },
          () => {
            if (stopped) context.stopCompletion();
          },
        );

        if (!result.text) throw new Error('Model zwrócił pustą odpowiedź');

        if (TOKEN_TRACKING_ENABLED) {
          const promptText = messages.map((m) => m.content).join('');
          const promptTokens =
            (result as any).tokens_evaluated ?? estimateTokens(promptText);
          const completionTokens =
            (result as any).tokens_predicted ?? estimateTokens(result.text);
          recordTokenUsage({
            provider: 'local',
            model: modelId,
            operation: operation ?? 'compose',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          });
        }

        return result.text;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

export async function releaseLocalProvider(): Promise<void> {
  if (cachedContext) {
    await releaseAllLlama();
    cachedContext = null;
    cachedModelId = null;
  }
}
