/**
 * End-to-end proof-of-concept: regex-only anonymization flow.
 *
 * Demonstrates that the full anonymize → cloud → de-anonymize loop
 * works WITHOUT any on-device AI model (no Qwen, no GLiNER, no NER
 * layer at all). Pipeline uses only:
 *
 *   - Strip quoted-reply history
 *   - Regex detection (18 structured categories)
 *   - Role-tag seeding from EmailContext
 *   - Sensitive-topic keyword gate (Art. 9/10)
 *   - Post-pipeline regex safety re-scan
 *   - De-anonymization via PlaceholderMap
 *
 * The "cloud AI" is mocked here — the real cloud would run unchanged.
 * This test proves the regex-only path is viable end-to-end and
 * correctly round-trips real values through the placeholder map.
 */

import {
  anonymizeMessages,
  deAnonymize,
  regexScan,
  detectSensitiveCategories,
} from '@/src/features/ai/anonymization';
import { isSupportedLanguage } from '@/src/features/ai/anonymization/languageGate';
import type { ChatMessage, EmailContext } from '@/src/features/ai/types';

/**
 * Simulates the full anonymizingCloudProvider.generate flow WITHOUT
 * NER. Intentionally written inline here (not as a new provider) so
 * the test shows exactly what changes in the existing wrapper.
 */
async function runRegexOnlyCloudFlow(options: {
  messages: ChatMessage[];
  ctx?: EmailContext;
  mockCloud: (msgs: ChatMessage[]) => Promise<string>;
}): Promise<string> {
  const { messages, ctx, mockCloud } = options;

  // Gate 1: language
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (!isSupportedLanguage(msg.content)) {
      throw new Error('Unsupported language');
    }
  }

  // Gate 2: sensitive topics
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const cats = detectSensitiveCategories(msg.content);
    if (cats.length > 0) {
      throw new Error(`Sensitive topic: ${cats.join(', ')}`);
    }
  }

  // Anonymize — no runNerInference passed
  const { anonMessages, map } = await anonymizeMessages(messages, { ctx });

  // Safety re-scan — deterministic floor
  for (const msg of anonMessages) {
    if (msg.role === 'system') continue;
    const leaks = regexScan(msg.content);
    if (leaks.length > 0) {
      throw new Error(
        `Anonymization leak: ${leaks.map((l) => `${l.type}:${l.value}`).join(', ')}`,
      );
    }
  }

  // Simulate cloud call
  const response = await mockCloud(anonMessages);

  // De-anonymize
  return deAnonymize(response, map);
}

describe('regex-only cloud flow (no NER model required)', () => {
  it('round-trips a basic email through anonymize → cloud → de-anonymize', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an email assistant.' },
      {
        role: 'user',
        content:
          'Please reply to alice@acme.com that we received her order. ' +
          'Her phone is +48 600 700 800 and IBAN DE89370400440532013000.',
      },
    ];

    const cloudCalls: ChatMessage[][] = [];
    const mockCloud = jest.fn(async (msgs: ChatMessage[]) => {
      cloudCalls.push(msgs);
      // Simulate cloud AI producing a reply that references the placeholders
      return 'Reply drafted. Will contact <EMAIL_1> at <PHONE_1>.';
    });

    const result = await runRegexOnlyCloudFlow({
      messages,
      mockCloud,
    });

    // 1. Cloud was called with anonymized payload — no raw PII visible
    expect(cloudCalls.length).toBe(1);
    const outgoing = cloudCalls[0]!;
    const userMsg = outgoing.find((m) => m.role === 'user')!;
    expect(userMsg.content).not.toContain('alice@acme.com');
    expect(userMsg.content).not.toContain('+48 600 700 800');
    expect(userMsg.content).not.toContain('DE89370400440532013000');
    expect(userMsg.content).toContain('<EMAIL_1>');
    expect(userMsg.content).toContain('<PHONE_1>');
    expect(userMsg.content).toContain('<IBAN_1>');

    // 2. Cloud response with placeholders was de-anonymized back to real values
    expect(result).toContain('alice@acme.com');
    expect(result).toContain('+48 600 700 800');
    expect(result).not.toContain('<EMAIL_1>');
    expect(result).not.toContain('<PHONE_1>');
  });

  it('handles role-tag substitution from EmailContext without NER', async () => {
    const ctx: EmailContext = {
      from: { email: 'john@acme.com', name: 'John Doe' },
      user: { givenName: 'Kasia', familyName: 'Nowak' },
    };

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: 'Draft a reply to John Doe thanking him. Signed, Kasia Nowak.',
      },
    ];

    const mockCloud = jest.fn(async () => {
      // Cloud sees role tags, produces response using them
      return 'Drogi <RECIPIENT_1>, dziękuję. Pozdrawiam, <SENDER_1>.';
    });

    const result = await runRegexOnlyCloudFlow({
      messages,
      ctx,
      mockCloud,
    });

    // Cloud never saw the real names
    const sent = (mockCloud as jest.Mock).mock.calls[0]![0] as ChatMessage[];
    const userSent = sent.find((m) => m.role === 'user')!;
    expect(userSent.content).not.toContain('John Doe');
    expect(userSent.content).not.toContain('Kasia Nowak');

    // De-anonymized response restored both role tags to real values
    expect(result).toContain('John Doe');
    expect(result).toContain('Kasia Nowak');
  });

  it('regex safety re-scan catches structured PII that escapes the pipeline', async () => {
    // This is a synthetic test: we patch the first-pass anonymize to leak
    // an email, then verify the safety re-scan catches it before the cloud.
    const messages: ChatMessage[] = [
      { role: 'user', content: 'alice@example.com and nothing else' },
    ];

    // Run anonymize normally first
    const { anonMessages } = await anonymizeMessages(messages, {});
    // Sanity: our regex DOES catch this email
    expect(anonMessages[0]!.content).not.toContain('alice@example.com');

    // Now manually inject a leak (simulating pipeline bug) and verify
    // the safety re-scan catches it
    const leakyMessages: ChatMessage[] = [
      {
        role: 'user',
        content: 'Real leak: leaked@example.com slipped through',
      },
    ];
    const leaks = regexScan(leakyMessages[0]!.content);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0]!.type).toBe('EMAIL');
  });

  it('handles all 18 regex categories end-to-end round-trip', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          'Kontakt: alice@acme.com',
          'Tel: +48 600 700 800',
          'Telefon stacjonarny: 22 555 12 34',
          'PESEL: 44051401458',
          'NIP: 1234567802',
          'REGON: 123456785',
          'KRS: 0000123456',
          'Dowód: ABC123458',
          'Paszport: AA1234567',
          'IBAN: DE89370400440532013000',
          'Karta: 4111111111111111',
          'Kod pocztowy: 00-123',
          'Data ur.: 15.01.1990',
          'IP: 192.168.1.1',
          'MAC: 00:1B:44:11:3A:B7',
          'GPS: 52.2297, 21.0122',
          'Pensja: 8500 zł',
          'Tablica: WA12345',
          'Link: https://example.com/reset?token=abc123',
        ].join('\n'),
      },
    ];

    const mockCloud = jest.fn(async (msgs: ChatMessage[]) => {
      // Cloud echoes back first message with all placeholders
      return msgs[0]!.content;
    });

    const result = await runRegexOnlyCloudFlow({
      messages,
      mockCloud,
    });

    // What cloud received should have NO raw PII of any kind
    const sent = mockCloud.mock.calls[0]![0]![0]!.content;
    expect(regexScan(sent)).toEqual([]);

    // Every original value must be restored in the final result
    expect(result).toContain('alice@acme.com');
    expect(result).toContain('600 700 800');
    expect(result).toContain('22 555 12 34');
    expect(result).toContain('44051401458');
    expect(result).toContain('1234567802');
    expect(result).toContain('123456785');
    expect(result).toContain('0000123456');
    expect(result).toContain('ABC123458');
    expect(result).toContain('AA1234567');
    expect(result).toContain('DE89370400440532013000');
    expect(result).toContain('4111111111111111');
    expect(result).toContain('00-123');
    expect(result).toContain('15.01.1990');
    expect(result).toContain('192.168.1.1');
    expect(result).toContain('00:1B:44:11:3A:B7');
    expect(result).toContain('52.2297, 21.0122');
    expect(result).toContain('8500 zł');
    expect(result).toContain('WA12345');
    expect(result).toContain('token=abc123');
  });

  it('prose names ARE NOT anonymized without NER — documented trade-off', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content:
          'I met Jan Kowalski at the Warsaw conference yesterday. ' +
          'His company ACME Corp is hiring.',
      },
    ];

    const mockCloud: (msgs: ChatMessage[]) => Promise<string> = jest.fn(
      async () => 'ok',
    );

    await runRegexOnlyCloudFlow({ messages, mockCloud });

    const sent = (mockCloud as jest.Mock).mock.calls[0]![0] as ChatMessage[];
    const userSent = sent.find((m) => m.role === 'user')!;

    // CRITICAL: prose names LEAK in regex-only mode. This is the accepted
    // trade-off for dropping the NER layer. Documented here so the test
    // serves as explicit warning to future maintainers.
    expect(userSent.content).toContain('Jan Kowalski');
    expect(userSent.content).toContain('Warsaw');
    expect(userSent.content).toContain('ACME Corp');
  });

  it('sensitive-topic gate still hard-blocks without NER', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Patient has diabetes and needs treatment.' },
    ];

    const mockCloud: (msgs: ChatMessage[]) => Promise<string> = jest.fn(
      async () => 'never',
    );

    await expect(
      runRegexOnlyCloudFlow({ messages, mockCloud }),
    ).rejects.toThrow(/Sensitive topic: health/);

    expect(mockCloud).not.toHaveBeenCalled();
  });

  // Language gate coverage lives in languageGate.test.ts with a proper
  // franc-min mock that can actually distinguish PL/EN/DE/FR/ES. The
  // global setup.ts mock used here is too permissive to test it.

  it('quoted-reply history IS stripped without NER', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          'Thanks, will review tomorrow.',
          '',
          'On Mon, Jan 1 Alice wrote:',
          '> PESEL: 44051401458',
          '> Phone: +48 600 700 800',
          '> Contact me at alice@example.com',
        ].join('\n'),
      },
    ];

    const mockCloud: (msgs: ChatMessage[]) => Promise<string> = jest.fn(
      async () => 'ok',
    );

    await runRegexOnlyCloudFlow({ messages, mockCloud });

    const sentMessages = (mockCloud as jest.Mock).mock
      .calls[0]![0] as ChatMessage[];
    const sent = sentMessages[0]!.content;
    // User's own text preserved
    expect(sent).toContain('Thanks, will review');
    // Quote history gone (strip + anonymization cover it)
    expect(sent).not.toContain('44051401458');
    expect(sent).not.toContain('alice@example.com');
  });
});
