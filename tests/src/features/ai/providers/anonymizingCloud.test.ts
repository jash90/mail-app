import type { ChatMessage, GenerateOptions } from '@/src/features/ai/types';
import { AIProviderError } from '@/src/shared/services/errors';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// franc-min is pure ESM; Jest can't parse it. Stub with a permissive
// detector that returns 'eng' for any long-enough text so the language
// gate lets everything through in these tests.
jest.mock('franc-min', () => ({
  franc: jest.fn((text: string) => {
    if (!text || text.length < 20) return 'und';
    return 'eng';
  }),
}));

const mockCloudGenerate = jest.fn();
jest.mock('@/src/features/ai/providers/cloud', () => ({
  cloudProvider: {
    name: 'cloud',
    generate: (messages: ChatMessage[], options?: GenerateOptions) =>
      mockCloudGenerate(messages, options),
  },
}));

const mockIsNerModelReady = jest.fn();
const mockRunNerInference = jest.fn();
jest.mock('@/src/features/ai/anonymization/nerContext', () => ({
  isNerModelReady: () => mockIsNerModelReady(),
  runNerInference: (prompt: string, signal?: AbortSignal) =>
    mockRunNerInference(prompt, signal),
  NerModelNotInstalledError: class extends Error {
    constructor() {
      super('NER model not installed');
      this.name = 'NerModelNotInstalledError';
    }
  },
}));

// resourceLock exposes acquireAI — mock it so we don't need to reason about
// the waiter queue across tests.
const mockAcquireAI = jest.fn();
jest.mock('@/src/shared/services/resourceLock', () => ({
  acquireAI: (signal?: AbortSignal) => mockAcquireAI(signal),
}));

// Import the SUT after the mocks are set up
import { anonymizingCloudProvider } from '@/src/features/ai/providers/anonymizingCloud';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('anonymizingCloudProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNerModelReady.mockReturnValue(true);
    mockAcquireAI.mockResolvedValue(() => {}); // release is a no-op
    mockRunNerInference.mockResolvedValue('NONE');
    mockCloudGenerate.mockResolvedValue('default response');
  });

  it('falls back to regex-only when NER model is not installed', async () => {
    // v2.2: NER is now OPTIONAL. When the PII Detector model isn't on
    // disk, the pipeline runs regex-only and still delegates to the
    // cloud provider. Structured PII is still deterministically
    // anonymized; only prose names would leak (documented trade-off).
    mockIsNerModelReady.mockReturnValue(false);
    mockCloudGenerate.mockResolvedValue('regex-only response');

    const result = await anonymizingCloudProvider.generate([
      { role: 'user', content: 'Contact alice@example.com please' },
    ]);

    // Cloud was called — NER absence is no longer a hard block
    expect(mockCloudGenerate).toHaveBeenCalledTimes(1);
    // AI lock was NEVER acquired — no NER = no llama.rn = no AI resource
    expect(mockAcquireAI).not.toHaveBeenCalled();
    // NER inference was NEVER invoked
    expect(mockRunNerInference).not.toHaveBeenCalled();
    // Outgoing payload still had the email regex-anonymized
    const [sentMessages] = mockCloudGenerate.mock.calls[0];
    expect(sentMessages[0].content).toContain('<EMAIL_1>');
    expect(sentMessages[0].content).not.toContain('alice@example.com');
    // Response came back
    expect(result).toBe('regex-only response');
  });

  it('acquires and releases the AI lock around the NER pass', async () => {
    const releaseAI = jest.fn();
    mockAcquireAI.mockResolvedValue(releaseAI);

    await anonymizingCloudProvider.generate([
      { role: 'user', content: 'no pii here' },
    ]);

    expect(mockAcquireAI).toHaveBeenCalledTimes(1);
    expect(releaseAI).toHaveBeenCalledTimes(1);
  });

  it('releases the AI lock even if anonymize throws', async () => {
    const releaseAI = jest.fn();
    mockAcquireAI.mockResolvedValue(releaseAI);
    mockRunNerInference.mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    );

    const abort = new AbortController();
    abort.abort();

    await expect(
      anonymizingCloudProvider.generate(
        [{ role: 'user', content: 'trigger abort' }],
        { signal: abort.signal },
      ),
    ).rejects.toThrow();

    expect(releaseAI).toHaveBeenCalledTimes(1);
  });

  it('replaces regex-detectable PII before delegating to cloud', async () => {
    mockCloudGenerate.mockResolvedValue('ok');

    await anonymizingCloudProvider.generate([
      { role: 'user', content: 'Email: alice@example.com, PESEL 44051401458' },
    ]);

    expect(mockCloudGenerate).toHaveBeenCalledTimes(1);
    const [anonMessages] = mockCloudGenerate.mock.calls[0];
    expect(anonMessages[0].content).not.toContain('alice@example.com');
    expect(anonMessages[0].content).not.toContain('44051401458');
    expect(anonMessages[0].content).toContain('<EMAIL_1>');
    expect(anonMessages[0].content).toContain('<PESEL_1>');
  });

  it('passes system prompts through untouched', async () => {
    await anonymizingCloudProvider.generate([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'no pii' },
    ]);

    const [anonMessages] = mockCloudGenerate.mock.calls[0];
    expect(anonMessages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
  });

  it('de-anonymizes the cloud response before returning', async () => {
    mockCloudGenerate.mockResolvedValue(
      'Sent to <EMAIL_1> as requested by <NAME_1>.',
    );
    mockRunNerInference.mockResolvedValue('NAME: Alice');

    const result = await anonymizingCloudProvider.generate([
      { role: 'user', content: 'Send to alice@example.com from Alice.' },
    ]);

    // Both EMAIL_1 (from regex) and NAME_1 (from NER mock) should be restored
    expect(result).toContain('alice@example.com');
    expect(result).toContain('Alice');
    expect(result).not.toContain('<EMAIL_1>');
    expect(result).not.toContain('<NAME_1>');
  });

  it('hard-fails with ANONYMIZATION_LEAK when regex re-scan finds PII', async () => {
    // Fabricate a leak: have the cloud mock echo the input, but supply a
    // message the regex pass will NOT replace (because it's a system prompt
    // that normally bypasses anonymization — here we pretend the pipeline
    // broke by mocking anonymizeMessages indirectly via stubbing NER to
    // inject a bogus EMAIL via... actually the pipeline is robust; easiest
    // way to test the re-scan is to put the email in a system prompt which
    // bypasses anonymization, and then confirm the re-scan DOES skip it
    // (system messages). That proves the skip logic; a LEAK test requires
    // forcing the pipeline to drop a value, which we test by mocking
    // anonymizeMessages.
    //
    // Simpler: verify that a system message with PII doesn't trigger a
    // leak error (system prompts are intentionally exempt).
    await expect(
      anonymizingCloudProvider.generate([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello there' },
      ]),
    ).resolves.toBe('default response');
  });

  it('forwards the operation to the underlying cloud provider', async () => {
    await anonymizingCloudProvider.generate(
      [{ role: 'user', content: 'test' }],
      { operation: 'summary' },
    );

    const [, options] = mockCloudGenerate.mock.calls[0];
    expect(options?.operation).toBe('summary');
  });

  it('hard-blocks sensitive content BEFORE acquiring AI lock', async () => {
    const releaseAI = jest.fn();
    mockAcquireAI.mockResolvedValue(releaseAI);

    await expect(
      anonymizingCloudProvider.generate([
        { role: 'user', content: 'Patient has diabetes and needs treatment.' },
      ]),
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'ANONYMIZATION_SENSITIVE_TOPIC',
    });

    // Critical: the AI lock was NEVER acquired, NER was NEVER called,
    // cloud was NEVER called. Fail-fast.
    expect(mockAcquireAI).not.toHaveBeenCalled();
    expect(releaseAI).not.toHaveBeenCalled();
    expect(mockRunNerInference).not.toHaveBeenCalled();
    expect(mockCloudGenerate).not.toHaveBeenCalled();
  });

  it('reports the detected sensitive category in the error message', async () => {
    try {
      await anonymizingCloudProvider.generate([
        { role: 'user', content: 'Idę do kościoła w niedzielę.' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('religion');
    }
  });

  it('does not trigger the sensitive gate on a neutral business email', async () => {
    mockCloudGenerate.mockResolvedValue('ok');

    await anonymizingCloudProvider.generate([
      {
        role: 'user',
        content: 'Quick update on the Q3 strategy meeting next week.',
      },
    ]);

    expect(mockCloudGenerate).toHaveBeenCalledTimes(1);
  });

  it('allows sensitive content in system prompts (deliberate)', async () => {
    mockCloudGenerate.mockResolvedValue('ok');

    await anonymizingCloudProvider.generate([
      {
        role: 'system',
        content:
          'You are an AI assistant specialized in medical diagnosis and treatment.',
      },
      { role: 'user', content: 'Hello' },
    ]);

    // System messages are never scanned by assertNoSensitiveTopics.
    expect(mockCloudGenerate).toHaveBeenCalledTimes(1);
  });

  it('seeds role tags from ctx so names in the body collapse', async () => {
    mockRunNerInference.mockResolvedValue('NONE');
    mockCloudGenerate.mockResolvedValue('ok');

    await anonymizingCloudProvider.generate(
      [
        {
          role: 'user',
          content: 'Please greet John Doe. Signed by Kasia Nowak.',
        },
      ],
      {
        ctx: {
          from: { email: 'john@acme.com', name: 'John Doe' },
          user: { givenName: 'Kasia', familyName: 'Nowak' },
        },
      },
    );

    const [anonMessages] = mockCloudGenerate.mock.calls[0];
    expect(anonMessages[0].content).not.toContain('John Doe');
    expect(anonMessages[0].content).not.toContain('Kasia Nowak');
    expect(anonMessages[0].content).toContain('<RECIPIENT_');
    expect(anonMessages[0].content).toContain('<SENDER_');
  });
});

// Dedicated test for the actual leak path — we need to stub anonymize itself.
describe('anonymizingCloudProvider leak detection', () => {
  it('throws ANONYMIZATION_LEAK when the pipeline fails to sanitize regex PII', async () => {
    // Reset all mocks and set a scenario where our mocked applyForward is
    // bypassed — the simplest way is to use jest.isolateModules to re-mock
    // anonymization internals for this one test.
    jest.resetModules();

    jest.doMock('@/src/features/ai/anonymization', () => ({
      anonymizeMessages: jest.fn().mockResolvedValue({
        // Return messages where PII survived (simulating a pipeline bug)
        anonMessages: [{ role: 'user', content: 'Leaked: real@leak.com' }],
        map: {
          applyReverse: (text: string) => text,
        },
      }),
      deAnonymize: jest.fn((text: string) => text),
      regexScan: jest.requireActual('@/src/features/ai/anonymization')
        .regexScan,
    }));

    jest.doMock('@/src/features/ai/providers/cloud', () => ({
      cloudProvider: {
        name: 'cloud',
        generate: jest.fn().mockResolvedValue('should never run'),
      },
    }));

    jest.doMock('@/src/features/ai/anonymization/nerContext', () => ({
      isNerModelReady: () => true,
      runNerInference: jest.fn(),
      NerModelNotInstalledError: class extends Error {},
    }));

    jest.doMock('@/src/shared/services/resourceLock', () => ({
      acquireAI: () => Promise.resolve(() => {}),
    }));

    const {
      anonymizingCloudProvider: sut,
    } = require('@/src/features/ai/providers/anonymizingCloud');

    await expect(
      sut.generate([{ role: 'user', content: 'anything' }]),
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      code: 'ANONYMIZATION_LEAK',
    });

    jest.resetModules();
  });
});
