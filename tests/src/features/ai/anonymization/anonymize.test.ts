import {
  anonymizeMessages,
  deAnonymize,
  regexScan,
} from '@/src/features/ai/anonymization';
import type { ChatMessage, EmailContext } from '@/src/features/ai/types';

describe('anonymizeMessages', () => {
  it('passes system prompts through untouched', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Email me at alice@example.com' },
    ];

    const { anonMessages } = await anonymizeMessages(messages);
    expect(anonMessages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(anonMessages[1].content).not.toContain('alice@example.com');
    expect(anonMessages[1].content).toContain('<EMAIL_1>');
  });

  it('strips quoted history before regex detection', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          'Thanks, will review.',
          '',
          'On Mon, Jan 1 John wrote:',
          '> Please contact alice@acme.com',
          '> PESEL 44051401458',
        ].join('\n'),
      },
    ];

    const { anonMessages } = await anonymizeMessages(messages);
    // Quoted content is gone entirely — the regex doesn't even see it.
    expect(anonMessages[0].content).toContain('Thanks, will review');
    expect(anonMessages[0].content).not.toContain('alice@acme.com');
    expect(anonMessages[0].content).not.toContain('44051401458');
  });

  it('reuses the same placeholder across multiple messages', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Send to alice@acme.com' },
      { role: 'assistant', content: 'Sending to alice@acme.com now' },
    ];

    const { anonMessages, map } = await anonymizeMessages(messages);
    expect(map.size).toBe(1);
    expect(anonMessages[0].content).toContain('<EMAIL_1>');
    expect(anonMessages[1].content).toContain('<EMAIL_1>');
  });

  it('seeds role tags from EmailContext so names in the body collapse', async () => {
    const ctx: EmailContext = {
      from: { email: 'john@acme.com', name: 'John Doe' },
      user: { givenName: 'Kasia', familyName: 'Nowak' },
    };

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content:
          'John Doe asked me to reach out. Could you confirm with Kasia Nowak?',
      },
    ];

    const { anonMessages, map } = await anonymizeMessages(messages, { ctx });

    expect(anonMessages[0].content).not.toContain('John Doe');
    expect(anonMessages[0].content).not.toContain('Kasia Nowak');
    expect(anonMessages[0].content).toContain('<RECIPIENT_');
    expect(anonMessages[0].content).toContain('<SENDER_');

    // Map has recipient + sender seeded
    expect(map.size).toBeGreaterThanOrEqual(2);
  });

  it('produces output that passes the safety re-scan', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          'Summary request:',
          'From: alice@acme.com',
          'Phone: +48 600 700 800',
          'PESEL: 44051401458',
          'IBAN: DE89370400440532013000',
          'Reset: https://example.com/reset?token=abc123xyz',
        ].join('\n'),
      },
    ];

    const { anonMessages } = await anonymizeMessages(messages);
    for (const msg of anonMessages) {
      if (msg.role === 'system') continue;
      expect(regexScan(msg.content)).toEqual([]);
    }
  });

  it('handles an empty message array', async () => {
    const { anonMessages, map } = await anonymizeMessages([]);
    expect(anonMessages).toEqual([]);
    expect(map.size).toBe(0);
  });

  it('runs the NER pass when runNerInference is provided', async () => {
    const runNerInference = jest
      .fn()
      .mockResolvedValue('NAME: Jan Kowalski\nPLACE: Gdańsk');

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: 'Jan Kowalski przyjechał do Gdańska w poniedziałek.',
      },
    ];

    const { anonMessages } = await anonymizeMessages(messages, {
      runNerInference,
    });

    expect(runNerInference).toHaveBeenCalledTimes(1);
    expect(anonMessages[0].content).not.toContain('Jan Kowalski');
    expect(anonMessages[0].content).not.toContain('Gdańska');
    expect(anonMessages[0].content).toContain('<NAME_1>');
    expect(anonMessages[0].content).toContain('<PLACE_1>');
  });

  it('skips NER when runNerInference is omitted', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Jan Kowalski przyjechał do Gdańska.' },
    ];

    // Regex-only mode: prose names are NOT stripped (NER disabled)
    const { anonMessages } = await anonymizeMessages(messages);
    expect(anonMessages[0].content).toContain('Jan Kowalski');
  });
});

describe('deAnonymize', () => {
  it('reverses the map so real values are restored', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Write to alice@example.com' },
    ];

    const { map } = await anonymizeMessages(messages);

    const aiResponse = 'I have sent the message to <EMAIL_1> as requested.';
    const restored = deAnonymize(aiResponse, map);
    expect(restored).toBe(
      'I have sent the message to alice@example.com as requested.',
    );
  });

  it('leaves untouched text without placeholders', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'alice@example.com' },
    ];
    const { map } = await anonymizeMessages(messages);
    expect(deAnonymize('Generic response with no tokens.', map)).toBe(
      'Generic response with no tokens.',
    );
  });

  it('round-trips role-tagged context correctly', async () => {
    const ctx: EmailContext = {
      from: { email: 'john@acme.com', name: 'John Doe' },
      user: { givenName: 'Kasia', familyName: 'Nowak' },
    };

    const messages: ChatMessage[] = [
      { role: 'user', content: 'John Doe asked Kasia Nowak for a reply.' },
    ];

    const { map } = await anonymizeMessages(messages, { ctx });
    const aiResponse = 'Drogi <RECIPIENT_1>, pozdrawiam <SENDER_1>.';
    expect(deAnonymize(aiResponse, map)).toBe(
      'Drogi John Doe <john@acme.com>, pozdrawiam Kasia Nowak.',
    );
  });
});
