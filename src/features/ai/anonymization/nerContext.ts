import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import {
  getModelFilePath,
  isModelDownloaded,
} from '../services/modelDownloader';
import { releaseLocalProvider } from '../providers/local';
import {
  TOKEN_TRACKING_ENABLED,
  recordTokenUsage,
  estimateTokens,
} from '../services/tokenTracker';
import { NER_MODEL_ID, getNerSystemPrompt } from './ner';

/**
 * Singleton llama.rn context for the NER model, separate from the local
 * chat model context in `providers/local.ts`.
 *
 * llama.rn holds a single native context at a time, so loading the NER
 * model releases any previously-loaded chat model (and vice-versa). This
 * file is deliberately isolated from `ner.ts` (pure logic) so that
 * `ner.ts` can be unit-tested without mocking the native module.
 *
 * Caller responsibilities:
 *   - Hold the AI resource lock (`acquireAI`) around any call that uses
 *     this context. Serialization against network ops is the lock's job.
 *   - Call `releaseNerContext` after a batch completes if the memory is
 *     needed for other work. The context survives across calls otherwise
 *     to amortize the ~3–5s cold start.
 */

let cachedContext: LlamaContext | null = null;

export class NerModelNotInstalledError extends Error {
  constructor() {
    super(`NER model '${NER_MODEL_ID}' is not installed`);
    this.name = 'NerModelNotInstalledError';
  }
}

async function getContext(): Promise<LlamaContext> {
  if (cachedContext) return cachedContext;

  if (!isModelDownloaded(NER_MODEL_ID)) {
    throw new NerModelNotInstalledError();
  }

  // llama.rn allows one native context at a time. Tear down any chat model
  // before loading NER; the chat path will re-init on its next use.
  await releaseLocalProvider();
  await releaseAllLlama();

  const modelPath = getModelFilePath(NER_MODEL_ID);
  if (!modelPath) {
    throw new Error(`Unknown model id: ${NER_MODEL_ID}`);
  }

  cachedContext = await initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_gpu_layers: 99,
  });

  return cachedContext;
}

/**
 * Release the NER llama.rn context. Call after batch operations to free
 * RAM for subsequent chat inference or reduce background memory pressure.
 */
export async function releaseNerContext(): Promise<void> {
  if (cachedContext) {
    await releaseAllLlama();
    cachedContext = null;
  }
}

/**
 * Pre-check whether the NER context can be loaded without hitting the
 * native module. Used by the Settings UI and the hard-block gate in
 * `anonymizingCloud` to decide whether to prompt the user to download the
 * model.
 */
export function isNerModelReady(): boolean {
  return isModelDownloaded(NER_MODEL_ID);
}

/**
 * Run a single NER inference. Exported as `NerInferenceFn` for `applyNer`.
 * Caller must hold the AI resource lock.
 */
export async function runNerInference(
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const context = await getContext();

  let stopped = false;
  const onAbort = () => {
    stopped = true;
    context.stopCompletion();
  };
  if (signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const result = await context.completion(
      {
        messages: [
          { role: 'system', content: getNerSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        n_predict: 512,
        temperature: 0.1,
        stop: ['<|end|>', '</s>', '<|eot_id|>', '<|im_end|>'],
      },
      () => {
        if (stopped) context.stopCompletion();
      },
    );

    if (TOKEN_TRACKING_ENABLED) {
      const promptTokens =
        (result as unknown as { tokens_evaluated?: number }).tokens_evaluated ??
        estimateTokens(prompt);
      const completionTokens =
        (result as unknown as { tokens_predicted?: number }).tokens_predicted ??
        estimateTokens(result.text ?? '');
      recordTokenUsage({
        provider: 'local',
        model: NER_MODEL_ID,
        operation: 'ner',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      });
    }

    return result.text ?? '';
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
