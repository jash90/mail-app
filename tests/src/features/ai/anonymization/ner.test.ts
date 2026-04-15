import {
  buildNerPrompt,
  parseNerOutput,
  applyNer,
  NER_MODEL_ID,
} from '@/src/features/ai/anonymization/ner';
import { PlaceholderMap } from '@/src/features/ai/anonymization/placeholders';
import { LOCAL_MODELS } from '@/src/features/ai/types';

describe('NER_MODEL_ID', () => {
  it('matches an entry in LOCAL_MODELS', () => {
    const entry = LOCAL_MODELS.find((m) => m.id === NER_MODEL_ID);
    expect(entry).toBeDefined();
    // v2: upgraded from Q4_K_M (400 MB) to Q8_0 (650 MB) for improved
    // small-LLM NER quality per PII-Bench research.
    expect(entry?.sizeMB).toBe(650);
    expect(entry?.filename).toContain('q8_0');
  });
});

describe('buildNerPrompt', () => {
  it('embeds the input text literally', () => {
    const prompt = buildNerPrompt('Hello Alice');
    expect(prompt).toContain('Hello Alice');
  });

  it('mentions all required entity types', () => {
    const prompt = buildNerPrompt('x');
    for (const type of [
      'NAME',
      'EMAIL',
      'PHONE',
      'PLACE',
      'ORG',
      'ID',
      'OTHER',
    ]) {
      expect(prompt).toContain(type);
    }
  });

  it('asks for the NONE sentinel', () => {
    expect(buildNerPrompt('x')).toContain('NONE');
  });
});

describe('parseNerOutput', () => {
  it('returns empty on empty input', () => {
    expect(parseNerOutput('')).toEqual([]);
    expect(parseNerOutput('   ')).toEqual([]);
  });

  it('returns empty on NONE sentinel', () => {
    expect(parseNerOutput('NONE')).toEqual([]);
    expect(parseNerOutput('none')).toEqual([]);
    expect(parseNerOutput('  NONE  ')).toEqual([]);
  });

  it('parses a simple list of entities', () => {
    const raw = [
      'NAME: Jan Kowalski',
      'EMAIL: jan@example.com',
      'PLACE: Warszawa',
    ].join('\n');

    expect(parseNerOutput(raw)).toEqual([
      { type: 'NAME', value: 'Jan Kowalski' },
      { type: 'EMAIL', value: 'jan@example.com' },
      { type: 'PLACE', value: 'Warszawa' },
    ]);
  });

  it('skips blank and malformed lines without throwing', () => {
    const raw = [
      'NAME: Alice',
      '',
      'this line has no colon',
      '   ',
      'ORG: Acme Corp',
    ].join('\n');

    expect(parseNerOutput(raw)).toEqual([
      { type: 'NAME', value: 'Alice' },
      { type: 'ORG', value: 'Acme Corp' },
    ]);
  });

  it('coerces unknown types to OTHER', () => {
    const raw = 'MEDICAL: diabetes';
    expect(parseNerOutput(raw)).toEqual([{ type: 'OTHER', value: 'diabetes' }]);
  });

  it('tolerates bullet or numbered prefixes on the type label', () => {
    const raw = ['- NAME: Alice', '1. EMAIL: alice@acme.com'].join('\n');
    expect(parseNerOutput(raw)).toEqual([
      { type: 'NAME', value: 'Alice' },
      { type: 'EMAIL', value: 'alice@acme.com' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const raw = 'NAME: Alice\r\nEMAIL: alice@acme.com';
    expect(parseNerOutput(raw)).toEqual([
      { type: 'NAME', value: 'Alice' },
      { type: 'EMAIL', value: 'alice@acme.com' },
    ]);
  });

  it('lowercases-then-uppercases type labels for case-insensitive matching', () => {
    const raw = 'name: Alice\nemail: alice@acme.com';
    expect(parseNerOutput(raw)).toEqual([
      { type: 'NAME', value: 'Alice' },
      { type: 'EMAIL', value: 'alice@acme.com' },
    ]);
  });

  it('skips entries with empty values', () => {
    const raw = 'NAME: \nEMAIL: alice@acme.com';
    expect(parseNerOutput(raw)).toEqual([
      { type: 'EMAIL', value: 'alice@acme.com' },
    ]);
  });
});

describe('applyNer', () => {
  it('registers entities in the map and substitutes them', async () => {
    const map = new PlaceholderMap();
    const text = 'Jan Kowalski pracuje w Acme Corp w Warszawie.';

    const runInference = jest
      .fn()
      .mockResolvedValue(
        ['NAME: Jan Kowalski', 'ORG: Acme Corp', 'PLACE: Warszawie'].join('\n'),
      );

    const result = await applyNer(text, map, runInference);

    expect(result).toContain('<NAME_1>');
    expect(result).toContain('<ORG_1>');
    expect(result).toContain('<PLACE_1>');
    expect(result).not.toContain('Jan Kowalski');
    expect(result).not.toContain('Acme Corp');
    expect(result).not.toContain('Warszawie');
  });

  it('skips empty text without calling the model', async () => {
    const map = new PlaceholderMap();
    const runInference = jest.fn();
    const result = await applyNer('   ', map, runInference);
    expect(result).toBe('   ');
    expect(runInference).not.toHaveBeenCalled();
  });

  it('returns the input unchanged when NER output is NONE', async () => {
    const map = new PlaceholderMap();
    const text = 'Generic text without any PII.';
    const runInference = jest.fn().mockResolvedValue('NONE');
    const result = await applyNer(text, map, runInference);
    expect(result).toBe(text);
    expect(map.size).toBe(0);
  });

  it('ignores hallucinated entities that do not appear in the text', async () => {
    const map = new PlaceholderMap();
    const text = 'Just some plain text.';
    const runInference = jest.fn().mockResolvedValue('NAME: Fabricated Person');
    const result = await applyNer(text, map, runInference);
    expect(result).toBe(text);
    expect(map.size).toBe(0);
  });

  it('degrades gracefully on inference error, returning input', async () => {
    // Silence the expected DEV warning during this test
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const map = new PlaceholderMap();
    const text = 'Alice works at Acme.';
    const runInference = jest.fn().mockRejectedValue(new Error('boom'));
    const result = await applyNer(text, map, runInference);
    expect(result).toBe(text);
    expect(map.size).toBe(0);
    spy.mockRestore();
  });

  it('rethrows on abort', async () => {
    const map = new PlaceholderMap();
    const text = 'Alice works at Acme.';
    const abort = new AbortController();
    abort.abort();
    const runInference = jest
      .fn()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      applyNer(text, map, runInference, abort.signal),
    ).rejects.toThrow();
  });

  it('reuses placeholders across multiple calls on the same map', async () => {
    const map = new PlaceholderMap();
    const run = jest.fn().mockResolvedValue('NAME: Alice');

    const out1 = await applyNer('Alice wrote a report.', map, run);
    const out2 = await applyNer('Then Alice reviewed it.', map, run);

    expect(out1).toContain('<NAME_1>');
    expect(out2).toContain('<NAME_1>');
    expect(map.size).toBe(1);
  });
});
