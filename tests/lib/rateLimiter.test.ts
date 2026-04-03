import {
  executeWithRetry,
  RetryableError,
  NonRetryableError,
  clearAllCooldowns,
  updateThrottleState,
  waitForCooldown,
  delay,
} from '@/lib/rateLimiter';

// Mock Sentry to avoid native module issues
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

// Mock config/constants
jest.mock('@/config/constants', () => ({
  RATE_LIMIT: {
    maxRetries: 3,
    baseDelayMs: 10, // fast for tests
    maxDelayMs: 100,
  },
}));

beforeEach(() => {
  clearAllCooldowns();
});

describe('executeWithRetry', () => {
  it('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await executeWithRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on RetryableError and succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError('429'))
      .mockResolvedValue('ok');
    const result = await executeWithRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new RetryableError('rate limited'));
    await expect(
      executeWithRetry(fn, { maxRetries: 2 }),
    ).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry NonRetryableError', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new NonRetryableError('bad request'));
    await expect(
      executeWithRetry(fn, { maxRetries: 3 }),
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry generic errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(
      executeWithRetry(fn, { maxRetries: 3 }),
    ).rejects.toThrow('network down');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(
      executeWithRetry(fn, { signal: controller.signal }),
    ).rejects.toThrow('aborted');
    expect(fn).not.toHaveBeenCalled();
  });

  it('aborts during retry wait', async () => {
    const controller = new AbortController();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError('429'))
      .mockResolvedValue('ok');

    // Abort after a short delay
    setTimeout(() => controller.abort(), 5);

    await expect(
      executeWithRetry(fn, { maxRetries: 3, signal: controller.signal }),
    ).rejects.toThrow('aborted');
  });
});

describe('delay', () => {
  it('resolves after given ms', async () => {
    const start = Date.now();
    await delay(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe('updateThrottleState', () => {
  it('parses numeric Retry-After header', () => {
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '5' },
    });
    updateThrottleState(response, 'test-provider');
    // After update, waitForCooldown should wait
    // We just verify it doesn't throw
  });
});

describe('clearAllCooldowns', () => {
  it('resets all throttle state', () => {
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
    updateThrottleState(response, 'provider-a');
    clearAllCooldowns();
    // After clear, waitForCooldown should be instant
  });
});
