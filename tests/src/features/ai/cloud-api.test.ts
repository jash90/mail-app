/**
 * Tests for the Z.AI cloud API wrapper.
 * We mock global fetch since cloud-api.ts uses it directly.
 */

// Set env BEFORE module import — cloud-api.ts reads it at parse time
process.env.EXPO_PUBLIC_ZAI_API_KEY = 'test-api-key';

jest.mock('@/src/shared/config/constants', () => ({
  AI: {
    backend: 'zai',
    zai: {
      model: 'test-model',
      baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    },
    openrouter: {
      model: 'test-or-model',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    temperature: 0.7,
    timeoutMs: 5000,
  },
}));

import { chatCompletion } from '@/src/features/ai/services/cloud-api';

// ── fetch mock ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

function mockFetchResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('chatCompletion', () => {
  it('sends messages to Z.AI and returns content', async () => {
    mockFetchResponse({
      choices: [{ message: { content: 'Hello there!' } }],
    });

    const result = await chatCompletion([{ role: 'user', content: 'Hi' }]);

    expect(result).toBe('Hello there!');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toMatch(/^Bearer /);

    const body = JSON.parse(options.body);
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('throws on non-OK response', async () => {
    mockFetchResponse({ error: { message: 'Rate limited' } }, 429);

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('Rate limited');
  });

  it('throws on empty response', async () => {
    mockFetchResponse({ choices: [] });

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('empty response');
  });

  it('throws when choices[0] has no content', async () => {
    mockFetchResponse({
      choices: [{ message: { content: '' } }],
    });

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('empty response');
  });

  it('respects external abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    // fetch should be called with an aborted signal → will reject
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await expect(
      chatCompletion([{ role: 'user', content: 'Hi' }], controller.signal),
    ).rejects.toThrow();
  });

  it('includes temperature from config', async () => {
    mockFetchResponse({
      choices: [{ message: { content: 'OK' } }],
    });

    await chatCompletion([{ role: 'user', content: 'Test' }]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });
});
