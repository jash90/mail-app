/**
 * ONNX `InferenceSession` lifecycle for the BERT NER layer.
 *
 * One session per process. Loading HerBERT INT8 (~110 MB) is expensive
 * (~500 ms cold), so we cache it in a module-level singleton. The existing
 * AI resource lock at `features/ai/resourceLock.ts` serializes inference
 * with Gmail sync; this module does not acquire that lock itself — callers
 * hold it for the full hybrid pipeline.
 *
 * Graceful failure: `onnxruntime-react-native` is a native module that
 * isn't installed yet. We import it via a lazy `require()` so tests and
 * typecheck work without the package, and we return a typed error when
 * the package is missing at runtime. `bertContext.ts` converts that error
 * into `isBertModelReady() === false`, which lets the orchestrator skip
 * the BERT layer without user-visible crashes.
 */

import type { InferenceSession } from 'onnxruntime-react-native';

export class BertRuntimeUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'onnxruntime-react-native is not installed or failed to load. ' +
        'Run `bun add onnxruntime-react-native` and rebuild native projects ' +
        'with `npx expo prebuild --clean`.',
    );
    this.name = 'BertRuntimeUnavailableError';
    this.cause = cause;
  }
}

export class BertSessionLoadError extends Error {
  constructor(modelPath: string, cause: unknown) {
    super(`Failed to load BERT ONNX model at "${modelPath}"`);
    this.name = 'BertSessionLoadError';
    this.cause = cause;
  }
}

let cachedSession: InferenceSession | null = null;
let loadingPromise: Promise<InferenceSession> | null = null;

/**
 * Return the cached `InferenceSession`, creating it on first call. Safe to
 * call concurrently — the in-flight load promise is shared.
 *
 * Throws `BertRuntimeUnavailableError` if `onnxruntime-react-native` can't
 * be loaded (package not installed, native rebuild needed). Throws
 * `BertSessionLoadError` if the model file at `modelPath` can't be parsed
 * or is corrupt.
 */
export async function getBertSession(
  modelPath: string,
): Promise<InferenceSession> {
  if (cachedSession) return cachedSession;
  if (loadingPromise) return loadingPromise;

  loadingPromise = loadSession(modelPath).finally(() => {
    loadingPromise = null;
  });
  cachedSession = await loadingPromise;
  return cachedSession;
}

/**
 * Release the cached session and free its native memory. Idempotent — safe
 * to call when no session is loaded.
 */
export async function releaseBertSession(): Promise<void> {
  if (!cachedSession) return;
  const session = cachedSession;
  cachedSession = null;
  try {
    await session.release();
  } catch {
    // Best-effort release. A failed teardown still frees the JS reference;
    // the native side will reclaim memory when the app process exits.
  }
}

/** `true` iff a session has been successfully loaded and not released. */
export function isBertSessionLoaded(): boolean {
  return cachedSession !== null;
}

// --- internals --------------------------------------------------------------

/**
 * Lazy-load `onnxruntime-react-native` so the import failure is a runtime
 * error we can catch, not a build-time error that breaks the whole app.
 * The `eslint-disable` is intentional: static `import` would unconditionally
 * resolve the module at load time.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
function loadRuntime(): typeof import('onnxruntime-react-native') {
  try {
    return require('onnxruntime-react-native') as typeof import('onnxruntime-react-native');
  } catch (err) {
    throw new BertRuntimeUnavailableError(err);
  }
}

async function loadSession(modelPath: string): Promise<InferenceSession> {
  const ort = loadRuntime();
  try {
    return await ort.InferenceSession.create(modelPath, {
      // iOS: CoreML offloads to ANE/GPU when supported, falls back to CPU.
      // Android: Run CPU by default. NNAPI can be wired in later if a
      // particular device benchmarks better.
      executionProviders: ['coreml', 'cpu'],
      graphOptimizationLevel: 'all',
    });
  } catch (err) {
    throw new BertSessionLoadError(modelPath, err);
  }
}
