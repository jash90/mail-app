import { RATE_LIMIT } from '@/config/constants';

// --- Error types ---

export class RetryableError extends Error {
  response?: Response;
  constructor(message: string, response?: Response) {
    super(message);
    this.name = 'RetryableError';
    this.response = response;
  }
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

// --- Throttle state ---

interface ThrottleState {
  retryAfterMs: number | null;
  cooldownUntil: number | null;
}

const throttleStates = new Map<string, ThrottleState>();

function getState(provider: string): ThrottleState {
  if (!throttleStates.has(provider)) {
    throttleStates.set(provider, {
      retryAfterMs: null,
      cooldownUntil: null,
    });
  }
  return throttleStates.get(provider)!;
}

// --- Helpers ---

export const delay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return delay(ms);
  if (signal.aborted)
    return Promise.reject(
      new DOMException('The operation was aborted.', 'AbortError'),
    );
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const jitter = () => Math.random() * 500;

// --- Public API ---

export async function waitForCooldown(provider = 'gmail'): Promise<void> {
  const state = getState(provider);
  if (state.cooldownUntil && Date.now() < state.cooldownUntil) {
    const remaining = state.cooldownUntil - Date.now();
    if (remaining > 0) await delay(remaining);
  }
}

export function updateThrottleState(
  response: Response,
  provider = 'gmail',
): void {
  const state = getState(provider);

  // Retry-After header
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    let delayMs: number | null = null;
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      delayMs = seconds * 1000;
    } else {
      const parsed = Date.parse(retryAfter);
      if (!isNaN(parsed)) {
        const diff = parsed - Date.now();
        if (diff > 0) delayMs = diff;
      }
    }
    if (delayMs !== null) {
      state.retryAfterMs = delayMs;
      state.cooldownUntil = Date.now() + delayMs;
    }
  }
}

export function clearAllCooldowns(): void {
  throttleStates.clear();
}

/**
 * Execute an async function with automatic retry on 429/5xx errors.
 * Respects Retry-After headers and applies exponential backoff with jitter.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; provider?: string; signal?: AbortSignal },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? RATE_LIMIT.maxRetries;
  const provider = opts?.provider ?? 'gmail';
  const signal = opts?.signal;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      return await fn();
    } catch (error) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      if (error instanceof NonRetryableError || attempt === maxRetries) {
        throw error;
      }

      if (!(error instanceof RetryableError)) {
        throw error;
      }

      // Compute delay: prefer Retry-After header, fall back to exponential backoff
      const retryAfterHeader = error.response?.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader
        ? parseInt(retryAfterHeader, 10)
        : NaN;
      const delayMs = !isNaN(retryAfterSec)
        ? Math.min(retryAfterSec * 1000 + jitter(), RATE_LIMIT.maxDelayMs)
        : Math.min(
            RATE_LIMIT.baseDelayMs * 2 ** attempt + jitter(),
            RATE_LIMIT.maxDelayMs,
          );

      // Set cooldown so other concurrent requests also wait
      const state = getState(provider);
      state.cooldownUntil = Date.now() + delayMs;

      console.warn(
        `[RateLimiter] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms: ${error.message}`,
      );
      await abortableDelay(delayMs, signal);
    }
  }

  // Unreachable — the loop always returns or throws
  throw new Error('executeWithRetry: unreachable');
}
