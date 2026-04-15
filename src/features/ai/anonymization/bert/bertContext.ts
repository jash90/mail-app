/**
 * Caller-facing bridge for the BERT NER layer.
 *
 * Mirrors the shape of the existing `nerContext.ts` (Qwen llama.rn) so the
 * orchestrator can swap layers uniformly. Responsibilities:
 *   - Check whether the model file is on disk (`isBertModelReady`).
 *   - Load the session lazily on first inference.
 *   - Run the full pipeline (tokenize → ONNX → BIO decode → entities).
 *   - Swallow runtime failures gracefully so a missing or broken BERT layer
 *     never crashes the whole anonymization pipeline — the orchestrator
 *     simply treats this layer as absent and falls back to regex + LLM.
 *
 * Intentionally does NOT acquire `resourceLock`. The hybrid orchestrator
 * holds the shared AI lock for the duration of its parallel fan-out so
 * BERT and LLM can run side-by-side without double-acquiring.
 */

import type { BertEntity, BertTokenizer } from './bertTypes';
import { createOnnxRunner, runBertNer } from './bertInference';
import {
  BertRuntimeUnavailableError,
  BertSessionLoadError,
  getBertSession,
  isBertSessionLoaded,
  releaseBertSession,
} from './bertSession';

/**
 * Resource handles required to initialize the BERT layer. The tokenizer
 * and model path are decoupled so the caller (typically the download
 * manager) can construct them at startup and pass them in.
 */
export interface BertContextConfig {
  /** Absolute on-disk path to the ONNX model file. */
  readonly modelPath: string;
  /** Pre-loaded HerBERT tokenizer instance. */
  readonly tokenizer: BertTokenizer;
  /**
   * Predicate used by `isBertModelReady()` to confirm the model file still
   * exists before claiming readiness. Injected so tests can stub the
   * file-system check.
   */
  readonly modelFileExists: () => boolean;
}

let config: BertContextConfig | null = null;
let failureReason: 'none' | 'runtime-unavailable' | 'model-load-failed' =
  'none';

/**
 * Install the configuration. Call once after the model and tokenizer are
 * downloaded / parsed. Subsequent calls replace the config and release any
 * cached session.
 */
export async function configureBertContext(
  next: BertContextConfig,
): Promise<void> {
  if (isBertSessionLoaded()) {
    await releaseBertSession();
  }
  config = next;
  failureReason = 'none';
}

/**
 * Remove the configuration, release the session, and put the bridge back
 * in the uninitialized state. Useful when the user deletes the model.
 */
export async function resetBertContext(): Promise<void> {
  await releaseBertSession();
  config = null;
  failureReason = 'none';
}

/**
 * `true` iff the bridge is configured AND the model file is on disk AND
 * the last inference attempt didn't fail with an unrecoverable error. A
 * `false` return prompts the orchestrator to skip this layer.
 */
export function isBertModelReady(): boolean {
  if (!config) return false;
  if (failureReason !== 'none') return false;
  return config.modelFileExists();
}

/**
 * Run BERT NER on a single text input. Never throws — on any failure the
 * error is logged (via console.warn in DEV) and an empty array is returned
 * so the orchestrator's `Promise.allSettled` still sees a fulfilled result.
 *
 * The `signal` is accepted for API parity with the LLM layer but ONNX
 * Runtime has no mid-inference cancellation hook — a signaled abort only
 * prevents FUTURE invocations inside the same fan-out.
 */
export async function runBertInference(
  text: string,
  signal?: AbortSignal,
): Promise<BertEntity[]> {
  if (!config) return [];
  if (signal?.aborted) return [];

  try {
    const session = await getBertSession(config.modelPath);
    const runner = createOnnxRunner(session);
    return await runBertNer(text, config.tokenizer, runner);
  } catch (err) {
    if (err instanceof BertRuntimeUnavailableError) {
      failureReason = 'runtime-unavailable';
    } else if (err instanceof BertSessionLoadError) {
      failureReason = 'model-load-failed';
    }
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bertContext] inference failed', err);
    }
    return [];
  }
}

/**
 * Last observed failure cause, for surfacing in the Privacy Settings UI
 * ("Nie można załadować modelu" vs "Biblioteka niezainstalowana"). `'none'`
 * means the layer is operational or has not been exercised yet.
 */
export function getBertFailureReason(): typeof failureReason {
  return failureReason;
}
