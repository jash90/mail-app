import {
  createBioLabelMap,
  decodeBioTags,
  resolveBioLabel,
} from '@/src/features/ai/anonymization/bert/bertBioDecoder';
import type {
  BioTag,
  TokenOffset,
} from '@/src/features/ai/anonymization/bert/bertTypes';

/**
 * Helper for constructing decoder inputs inline. `tokens` is a parallel
 * array of [tag, start, end] tuples, mirroring what a HerBERT NER model
 * plus the tokenizer would emit together.
 */
function buildInput(
  text: string,
  tokens: ReadonlyArray<readonly [BioTag, number, number]>,
) {
  const tokenTags: BioTag[] = tokens.map(([tag]) => tag);
  const tokenOffsets: TokenOffset[] = tokens.map(([, start, end]) => ({
    start,
    end,
  }));
  return { text, tokenTags, tokenOffsets };
}

describe('decodeBioTags', () => {
  it('returns an empty array for an all-O tag sequence', () => {
    const input = buildInput('kot i pies', [
      ['O', 0, 3],
      ['O', 4, 5],
      ['O', 6, 10],
    ]);
    expect(decodeBioTags(input)).toEqual([]);
  });

  it('decodes a single-token entity', () => {
    const input = buildInput('Warszawa', [['B-LOC', 0, 8]]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'LOC', value: 'Warszawa', start: 0, end: 8 },
    ]);
  });

  it('joins B- + I- tokens of the same type into one entity', () => {
    // "Jan Kowalski" — two words, BPE gives two tokens, both PERSON.
    const input = buildInput('Jan Kowalski', [
      ['B-PER', 0, 3],
      ['I-PER', 4, 12],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Jan Kowalski', start: 0, end: 12 },
    ]);
  });

  it('joins multiple I- continuations into a single span', () => {
    // Subword tokens: "War" + "sza" + "wa" all labeled I-LOC (continuation
    // after an initial B-LOC on the first subword).
    const input = buildInput('Warszawa', [
      ['B-LOC', 0, 3],
      ['I-LOC', 3, 6],
      ['I-LOC', 6, 8],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'LOC', value: 'Warszawa', start: 0, end: 8 },
    ]);
  });

  it('emits consecutive entities of the same type when a new B- begins', () => {
    // "Anna i Maria" — two distinct PERSON entities, not one merged span.
    const input = buildInput('Anna i Maria', [
      ['B-PER', 0, 4],
      ['O', 5, 6],
      ['B-PER', 7, 12],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Anna', start: 0, end: 4 },
      { type: 'PER', value: 'Maria', start: 7, end: 12 },
    ]);
  });

  it('closes a running entity when a tag of a different type begins', () => {
    // "Jan Allegro" — mistakenly "Jan" = PERSON, "Allegro" = ORG. Closing
    // the PER entity between them is the correct behaviour.
    const input = buildInput('Jan Allegro', [
      ['B-PER', 0, 3],
      ['B-ORG', 4, 11],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Jan', start: 0, end: 3 },
      { type: 'ORG', value: 'Allegro', start: 4, end: 11 },
    ]);
  });

  it('treats an orphan I- tag as an implicit B- (defensive)', () => {
    // Real models sometimes emit I- without a preceding B- at word boundaries.
    // Dropping it would under-mask PII — we start a new entity instead.
    const input = buildInput('Kraków', [['I-LOC', 0, 6]]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'LOC', value: 'Kraków', start: 0, end: 6 },
    ]);
  });

  it('closes an I- entity when a type flip occurs mid-run', () => {
    // "B-PER I-LOC" — the I-LOC closes the PERSON entity and starts LOCATION.
    const input = buildInput('Jan Polska', [
      ['B-PER', 0, 3],
      ['I-LOC', 4, 10],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Jan', start: 0, end: 3 },
      { type: 'LOC', value: 'Polska', start: 4, end: 10 },
    ]);
  });

  it('finalizes the last running entity at end of stream', () => {
    const input = buildInput('Adam', [['B-PER', 0, 4]]);
    expect(decodeBioTags(input)).toHaveLength(1);
  });

  it('skips tokens with degenerate offsets (CLS/SEP positions)', () => {
    // A malformed input where an O tag sits on a zero-width offset must
    // not disrupt the decoder even if more entities follow.
    const input = buildInput('Adam', [
      ['O', 0, 0],
      ['B-PER', 0, 4],
      ['O', 4, 4],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Adam', start: 0, end: 4 },
    ]);
  });

  it('skips degenerate spans even when tagged non-O (defensive)', () => {
    const input = buildInput('Adam', [
      ['B-PER', 0, 0],
      ['B-PER', 0, 4],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Adam', start: 0, end: 4 },
    ]);
  });

  it('throws on mismatched tag/offset array lengths', () => {
    expect(() =>
      decodeBioTags({
        text: 'hi',
        tokenTags: ['O'],
        tokenOffsets: [
          { start: 0, end: 1 },
          { start: 1, end: 2 },
        ],
      }),
    ).toThrow(/length mismatch/);
  });

  it('handles all three entity types in one sequence', () => {
    const input = buildInput('Anna z Allegro odwiedziła Kraków', [
      ['B-PER', 0, 4],
      ['O', 5, 6],
      ['B-ORG', 7, 14],
      ['O', 15, 25],
      ['B-LOC', 26, 32],
    ]);
    expect(decodeBioTags(input)).toEqual([
      { type: 'PER', value: 'Anna', start: 0, end: 4 },
      { type: 'ORG', value: 'Allegro', start: 7, end: 14 },
      { type: 'LOC', value: 'Kraków', start: 26, end: 32 },
    ]);
  });
});

describe('createBioLabelMap', () => {
  it('builds a map from an ordered tag array', () => {
    const map = createBioLabelMap(['O', 'B-PER', 'I-PER']);
    expect(map.get(0)).toBe('O');
    expect(map.get(1)).toBe('B-PER');
    expect(map.get(2)).toBe('I-PER');
    expect(map.size).toBe(3);
  });

  it('returns an empty map for an empty array', () => {
    const map = createBioLabelMap([]);
    expect(map.size).toBe(0);
  });
});

describe('resolveBioLabel', () => {
  const map = createBioLabelMap(['O', 'B-PER', 'I-PER', 'B-LOC', 'I-LOC']);

  it('resolves known label ids', () => {
    expect(resolveBioLabel(map, 0)).toBe('O');
    expect(resolveBioLabel(map, 1)).toBe('B-PER');
    expect(resolveBioLabel(map, 4)).toBe('I-LOC');
  });

  it('falls back to O for unknown label ids', () => {
    expect(resolveBioLabel(map, 99)).toBe('O');
    expect(resolveBioLabel(map, -1)).toBe('O');
  });
});
