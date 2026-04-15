import {
  createBertTokenizer,
  parseMergesText,
  parseVocabJson,
} from '@/src/features/ai/anonymization/bert/bertTokenizer';
import type {
  MergeRanks,
  SpecialTokens,
  VocabMap,
} from '@/src/features/ai/anonymization/bert/bertTypes';

/**
 * Synthetic HerBERT-style vocab + merges. Covers:
 *   - Special tokens at low ids (matching RoBERTa convention).
 *   - Single-character tokens so unmerged words still encode cleanly.
 *   - A handful of end-of-word variants (`n</w>`, `a</w>`, ...).
 *   - A few merged subwords for testing BPE chain resolution.
 *
 * This is NOT a real HerBERT vocab — it exists to verify the algorithm in
 * isolation. The real vocab/merges integration ships in Step 2 alongside the
 * ONNX session, with golden-file tests generated from the HF reference.
 */
const SPECIAL_TOKENS: SpecialTokens = {
  cls: '<s>',
  sep: '</s>',
  pad: '<pad>',
  unk: '<unk>',
  mask: '<mask>',
  endOfWord: '</w>',
};

const CLS_ID = 0;
const SEP_ID = 1;
const PAD_ID = 2;
const UNK_ID = 3;
const MASK_ID = 4;

function buildVocab(): VocabMap {
  const entries: Array<[string, number]> = [
    ['<s>', CLS_ID],
    ['</s>', SEP_ID],
    ['<pad>', PAD_ID],
    ['<unk>', UNK_ID],
    ['<mask>', MASK_ID],
    // Single chars — enough to avoid UNK for the test inputs below.
    ['a', 10],
    ['b', 11],
    ['c', 12],
    ['d', 13],
    ['j', 14],
    ['n', 15],
    ['k', 16],
    ['o', 17],
    ['w', 18],
    ['s', 19],
    ['z', 20],
    ['ł', 21],
    ['ą', 22],
    // End-of-word variants for chars that can terminate a word in tests.
    ['a</w>', 30],
    ['b</w>', 31],
    ['c</w>', 32],
    ['d</w>', 33],
    ['n</w>', 34],
    ['o</w>', 35],
    ['a</w>', 30], // duplicate OK, Map overwrites
    // Merged subwords.
    ['ab</w>', 40],
    ['cd</w>', 41],
    ['ja', 42],
    ['jan</w>', 43],
    // Punctuation as end-of-word tokens.
    ['.', 50],
    [',', 51],
    ['.</w>', 52],
  ];
  return new Map(entries);
}

function buildMerges(): MergeRanks {
  // Rank = priority (lower first). Each merge rule is `first second`.
  // The algorithm iteratively applies the lowest-rank matching pair.
  return new Map<string, number>([
    ['a b</w>', 0], // a + b</w>     → ab</w>
    ['c d</w>', 1], // c + d</w>     → cd</w>
    ['j a', 2], // j + a         → ja
    ['ja n</w>', 3], // ja + n</w>    → jan</w>
  ]);
}

describe('bertTokenizer', () => {
  const vocab = buildVocab();
  const merges = buildMerges();
  const tok = createBertTokenizer(vocab, merges, {
    specialTokens: SPECIAL_TOKENS,
  });

  describe('createBertTokenizer', () => {
    it('exposes resolved special token ids', () => {
      expect(tok.clsTokenId).toBe(CLS_ID);
      expect(tok.sepTokenId).toBe(SEP_ID);
      expect(tok.padTokenId).toBe(PAD_ID);
      expect(tok.unkTokenId).toBe(UNK_ID);
    });

    it('reports vocab size', () => {
      expect(tok.vocabSize).toBe(vocab.size);
    });

    it('throws when a required special token is missing from vocab', () => {
      const partial = new Map(vocab);
      partial.delete('<s>');
      expect(() =>
        createBertTokenizer(partial, merges, {
          specialTokens: SPECIAL_TOKENS,
        }),
      ).toThrow(/<s>/);
    });
  });

  describe('encode()', () => {
    it('emits only CLS + SEP for empty input', () => {
      const { ids, offsets } = tok.encode('');
      expect(ids).toEqual([CLS_ID, SEP_ID]);
      expect(offsets).toEqual([
        { start: 0, end: 0 },
        { start: 0, end: 0 },
      ]);
    });

    it('places CLS at the start and SEP at the end', () => {
      const { ids } = tok.encode('ab');
      expect(ids[0]).toBe(CLS_ID);
      expect(ids[ids.length - 1]).toBe(SEP_ID);
    });

    it('encodes a single word by resolving the full merge chain', () => {
      // "jan" → [j, a, n</w>] → [ja, n</w>] → [jan</w>]
      const { ids } = tok.encode('jan');
      expect(ids).toEqual([CLS_ID, 43, SEP_ID]);
    });

    it('stops merging when no applicable merge rule exists', () => {
      // "ba" has no merges → initial tokens survive: [b, a</w>]
      const { ids } = tok.encode('ba');
      expect(ids).toEqual([CLS_ID, 11 /* b */, 30 /* a</w> */, SEP_ID]);
    });

    it('applies the merge that produces a single end-of-word token', () => {
      // "ab" → [a, b</w>] → [ab</w>]
      const { ids } = tok.encode('ab');
      expect(ids).toEqual([CLS_ID, 40 /* ab</w> */, SEP_ID]);
    });

    it('falls back to UNK for characters missing from the vocab', () => {
      // "x" is not in the synthetic vocab.
      const { ids } = tok.encode('x');
      expect(ids).toEqual([CLS_ID, UNK_ID, SEP_ID]);
    });

    it('splits input on whitespace and processes each word independently', () => {
      // "ab cd" → [ab</w>, cd</w>]
      const { ids } = tok.encode('ab cd');
      expect(ids).toEqual([CLS_ID, 40 /* ab</w> */, 41 /* cd</w> */, SEP_ID]);
    });

    it('collapses multiple whitespace characters between words', () => {
      const { ids } = tok.encode('ab   cd');
      expect(ids).toEqual([CLS_ID, 40, 41, SEP_ID]);
    });

    it('handles tabs and newlines as whitespace', () => {
      const { ids } = tok.encode('ab\tcd\nab');
      expect(ids).toEqual([CLS_ID, 40, 41, 40, SEP_ID]);
    });

    it('splits punctuation into its own token', () => {
      // "ab." → [ab</w>, .</w>]
      const { ids } = tok.encode('ab.');
      expect(ids).toEqual([CLS_ID, 40 /* ab</w> */, 52 /* .</w> */, SEP_ID]);
    });

    it('passes Polish diacritics through as regular characters', () => {
      // "ł" and "ą" are in the single-char vocab. Each becomes its own word
      // when surrounded by whitespace, and the last char of each gets </w>.
      // Here both "ł" and "ą" are single-char words, so both become UNK
      // (no `ł</w>` or `ą</w>` entries in the synthetic vocab).
      const { ids } = tok.encode('ł ą');
      expect(ids).toEqual([CLS_ID, UNK_ID, UNK_ID, SEP_ID]);
    });
  });

  describe('offsets', () => {
    it('tracks absolute char offsets across words', () => {
      // "ab cd" — CLS at (0,0); "ab" word at (0,2); "cd" word at (3,5);
      // SEP at (5,5). Each word merges into a single token.
      const { offsets } = tok.encode('ab cd');
      expect(offsets).toEqual([
        { start: 0, end: 0 },
        { start: 0, end: 2 },
        { start: 3, end: 5 },
        { start: 5, end: 5 },
      ]);
    });

    it('preserves per-character offsets when no merges apply', () => {
      // "ba" — no merges → [b@[0,1), a</w>@[1,2)]
      const { offsets } = tok.encode('ba');
      expect(offsets).toEqual([
        { start: 0, end: 0 },
        { start: 0, end: 1 },
        { start: 1, end: 2 },
        { start: 2, end: 2 },
      ]);
    });

    it('spans merged subwords from first char start to last char end', () => {
      // "jan" → [jan</w>@[0,3)]
      const { offsets } = tok.encode('jan');
      expect(offsets).toEqual([
        { start: 0, end: 0 },
        { start: 0, end: 3 },
        { start: 3, end: 3 },
      ]);
    });

    it('tracks offsets across punctuation boundaries', () => {
      // "ab." at positions 0..3. "ab" word = [0,2); "." punct = [2,3).
      const { offsets } = tok.encode('ab.');
      expect(offsets).toEqual([
        { start: 0, end: 0 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 3, end: 3 },
      ]);
    });

    it('skips whitespace when assigning offsets', () => {
      // "ab   cd" — "ab" at [0,2), "cd" at [5,7). The two runs of spaces
      // at positions 2..5 are not represented in the offset stream.
      const { offsets } = tok.encode('ab   cd');
      expect(offsets[1]).toEqual({ start: 0, end: 2 });
      expect(offsets[2]).toEqual({ start: 5, end: 7 });
    });
  });

  describe('decode()', () => {
    it('strips special tokens', () => {
      const decoded = tok.decode([CLS_ID, 40 /* ab</w> */, SEP_ID]);
      expect(decoded).toBe('ab');
    });

    it('recovers word boundaries from the end-of-word marker', () => {
      // [ab</w>, cd</w>] → "ab cd"
      const decoded = tok.decode([CLS_ID, 40, 41, SEP_ID]);
      expect(decoded).toBe('ab cd');
    });

    it('joins subword chars within a single word', () => {
      // [b, a</w>] → "b" + "a</w>" → "ba</w>" → "ba"
      const decoded = tok.decode([CLS_ID, 11, 30, SEP_ID]);
      expect(decoded).toBe('ba');
    });

    it('ignores unknown ids', () => {
      const decoded = tok.decode([CLS_ID, 40, 9999, SEP_ID]);
      expect(decoded).toBe('ab');
    });

    it('round-trips a simple single-word case', () => {
      const { ids } = tok.encode('ab');
      expect(tok.decode(ids)).toBe('ab');
    });

    it('round-trips a multi-word case with whitespace', () => {
      const { ids } = tok.encode('ab cd');
      expect(tok.decode(ids)).toBe('ab cd');
    });
  });
});

describe('parseVocabJson', () => {
  it('parses a JSON string mapping token → id', () => {
    const json = '{"<s>": 0, "a": 10}';
    const map = parseVocabJson(json);
    expect(map.get('<s>')).toBe(0);
    expect(map.get('a')).toBe(10);
    expect(map.size).toBe(2);
  });

  it('accepts a pre-parsed object as input', () => {
    const map = parseVocabJson({ foo: 1, bar: 2 });
    expect(map.get('foo')).toBe(1);
    expect(map.get('bar')).toBe(2);
  });

  it('rejects non-object input', () => {
    expect(() => parseVocabJson('[]')).toThrow(/expected an object/);
    expect(() => parseVocabJson('null')).toThrow(/expected an object/);
  });

  it('rejects non-integer ids', () => {
    expect(() => parseVocabJson('{"a": 1.5}')).toThrow(/non-negative integer/);
    expect(() => parseVocabJson('{"a": "x"}')).toThrow(/non-negative integer/);
    expect(() => parseVocabJson('{"a": -1}')).toThrow(/non-negative integer/);
  });
});

describe('parseMergesText', () => {
  it('parses a merges.txt with version header', () => {
    const text = '#version: 0.2\na b\nc d\n';
    const ranks = parseMergesText(text);
    expect(ranks.get('a b')).toBe(0);
    expect(ranks.get('c d')).toBe(1);
    expect(ranks.size).toBe(2);
  });

  it('skips blank and comment lines', () => {
    const text = '\n#comment\n\na b\n\nc d\n';
    const ranks = parseMergesText(text);
    expect(ranks.get('a b')).toBe(0);
    expect(ranks.get('c d')).toBe(1);
    expect(ranks.size).toBe(2);
  });

  it('ignores lines without a space separator', () => {
    const text = 'noSpace\na b\n';
    const ranks = parseMergesText(text);
    expect(ranks.has('noSpace')).toBe(false);
    expect(ranks.get('a b')).toBe(0);
  });

  it('preserves merge order as the rank value', () => {
    const text = 'a b\nc d\ne f\n';
    const ranks = parseMergesText(text);
    expect(ranks.get('a b')).toBe(0);
    expect(ranks.get('c d')).toBe(1);
    expect(ranks.get('e f')).toBe(2);
  });
});
