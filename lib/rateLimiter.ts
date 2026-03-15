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

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.random() * 500;

// --- Public API ---

export function shouldThrottle(provider = 'gmail'): boolean {
  const state = getState(provider);
  return state.cooldownUntil !== null && Date.now() < state.cooldownUntil;
}

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
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      state.retryAfterMs = seconds * 1000;
      state.cooldownUntil = Date.now() + seconds * 1000;
    }
  }
}

export function clearCooldown(provider = 'gmail'): void {
  const state = getState(provider);
  state.cooldownUntil = null;
  state.retryAfterMs = null;
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
  opts?: { maxRetries?: number; provider?: string },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? RATE_LIMIT.maxRetries;
  const provider = opts?.provider ?? 'gmail';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NonRetryableError || attempt === maxRetries) {
        throw error;
      }

      if (!(error instanceof RetryableError)) {
        throw error;
      }

      // Compute delay: prefer Retry-After header, fall back to exponential backoff
      const retryAfterHeader = error.response?.headers.get('retry-after');
      const delayMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000 + jitter()
        : Math.min(
            RATE_LIMIT.baseDelayMs * 2 ** attempt + jitter(),
            RATE_LIMIT.maxDelayMs,
          );

      // Set cooldown so other concurrent requests also wait
      const state = getState(provider);
      state.cooldownUntil = Date.now() + delayMs;

      console.warn(`[RateLimiter] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms: ${error.message}`);
      await delay(delayMs);
    }
  }

  // Unreachable — the loop always returns or throws
  throw new Error('executeWithRetry: unreachable');
}
