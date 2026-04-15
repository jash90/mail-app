/**
 * Pure-JS HerBERT CharBPE tokenizer.
 *
 * Reference: HuggingFace `tokenizers` library, `CharBPETokenizer`. HerBERT
 * (allegro/herbert-base-cased) uses this tokenizer with RoBERTa-style
 * special tokens (`<s>` / `</s>` / `<pad>` / `<unk>` / `<mask>`) and an
 * end-of-word marker (`</w>`) appended to the last char of each word.
 *
 * Algorithm (encode):
 *   1. Pre-tokenize: split on whitespace + ASCII/Unicode punctuation. Each
 *      word and each punctuation char becomes an independent BPE input.
 *      Whitespace itself is discarded.
 *   2. For each word: split into characters, append `</w>` to the last
 *      character, then iteratively merge adjacent token pairs using the
 *      merges.txt ranking (lowest rank merged first) until no more merges
 *      apply.
 *   3. Look up each final token in vocab.json → integer id. Unknown tokens
 *      fall back to `<unk>`.
 *   4. Prepend `<s>`, append `</s>`. Return parallel `ids` and `offsets`
 *      arrays where each offset is a char span in the ORIGINAL input text.
 *
 * Algorithm correctness is verified against a synthetic vocab in
 * `tests/features/ai/anonymization/bert/bertTokenizer.test.ts`. When we
 * integrate the real HerBERT vocab + merges in Step 2, a separate golden-file
 * test (generated via a one-off Python script against the HF reference
 * tokenizer) will assert byte-identical id sequences.
 *
 * Performance: a trie or rank-indexed pair lookup would be faster, but the
 * naive O(n²)-per-word loop is fine for typical email text (~100 words, each
 * ~5 chars → <5 ms on A14). If profiling shows a hotspot, swap the inner
 * loop for a priority queue over adjacent pairs.
 */

import type {
  BertTokenizer,
  EncodedText,
  MergeRanks,
  SpecialTokens,
  TokenOffset,
  VocabMap,
} from './bertTypes';
import { DEFAULT_SPECIAL_TOKENS } from './bertTypes';

export interface CreateBertTokenizerOptions {
  /**
   * Override the default HerBERT special-token strings. The provided tokens
   * must exist in the supplied vocab map — the factory throws otherwise.
   */
  readonly specialTokens?: Partial<SpecialTokens>;
}

/**
 * Construct a `BertTokenizer` from a pre-parsed vocab and merge table.
 *
 * The factory does no I/O — callers are expected to load `vocab.json` and
 * `merges.txt` from disk or bundle them, then hand the parsed content in.
 * See `parseVocabJson` / `parseMergesText` helpers below.
 */
export function createBertTokenizer(
  vocab: VocabMap,
  merges: MergeRanks,
  options: CreateBertTokenizerOptions = {},
): BertTokenizer {
  const specials: SpecialTokens = {
    ...DEFAULT_SPECIAL_TOKENS,
    ...options.specialTokens,
  };

  const clsTokenId = resolveSpecialId(vocab, specials.cls);
  const sepTokenId = resolveSpecialId(vocab, specials.sep);
  const padTokenId = resolveSpecialId(vocab, specials.pad);
  const unkTokenId = resolveSpecialId(vocab, specials.unk);

  const reverseVocab = buildReverseVocab(vocab);

  const ctx: EncodeContext = {
    vocab,
    merges,
    clsTokenId,
    sepTokenId,
    unkTokenId,
    endOfWord: specials.endOfWord,
  };

  return {
    vocabSize: vocab.size,
    clsTokenId,
    sepTokenId,
    padTokenId,
    unkTokenId,
    encode(text: string): EncodedText {
      return encodeText(text, ctx);
    },
    decode(ids: readonly number[]): string {
      return decodeIds(ids, reverseVocab, specials);
    },
  };
}

// --- parsing helpers --------------------------------------------------------

/**
 * Parse a HuggingFace-style `vocab.json` file content (string or pre-parsed
 * object). Returns an immutable `VocabMap`. Throws on malformed input.
 */
export function parseVocabJson(
  source: string | Record<string, number>,
): VocabMap {
  const parsed =
    typeof source === 'string'
      ? (JSON.parse(source) as unknown)
      : (source as unknown);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid vocab: expected an object mapping token → id');
  }

  const map = new Map<string, number>();
  for (const [token, id] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new Error(
        `Invalid vocab entry for "${token}": expected non-negative integer id, got ${String(id)}`,
      );
    }
    map.set(token, id);
  }
  return map;
}

/**
 * Parse a HuggingFace-style `merges.txt` file. Each non-empty, non-comment
 * line is a pair `"first second"`; the line number (0-based, excluding
 * comments) becomes the merge rank. Lower rank = higher priority.
 */
export function parseMergesText(text: string): MergeRanks {
  const ranks = new Map<string, number>();
  let rank = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // HF merges.txt files start with a `#version: 0.2` comment line.
    if (line.startsWith('#')) continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx <= 0 || spaceIdx === line.length - 1) continue;
    const first = line.slice(0, spaceIdx);
    const second = line.slice(spaceIdx + 1);
    if (!first || !second) continue;
    ranks.set(`${first} ${second}`, rank);
    rank++;
  }
  return ranks;
}

// --- internal encode pipeline ----------------------------------------------

interface EncodeContext {
  readonly vocab: VocabMap;
  readonly merges: MergeRanks;
  readonly clsTokenId: number;
  readonly sepTokenId: number;
  readonly unkTokenId: number;
  readonly endOfWord: string;
}

interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface BpeToken {
  text: string;
  relStart: number;
  relEnd: number;
}

function encodeText(text: string, ctx: EncodeContext): EncodedText {
  const ids: number[] = [ctx.clsTokenId];
  const offsets: TokenOffset[] = [{ start: 0, end: 0 }];

  const words = preTokenize(text);
  for (const word of words) {
    const tokens = bpeEncodeWord(word.text, ctx.merges, ctx.endOfWord);
    for (const token of tokens) {
      const id = ctx.vocab.get(token.text) ?? ctx.unkTokenId;
      ids.push(id);
      offsets.push({
        start: word.start + token.relStart,
        end: word.start + token.relEnd,
      });
    }
  }

  ids.push(ctx.sepTokenId);
  offsets.push({ start: text.length, end: text.length });
  return { ids, offsets };
}

/**
 * BERT-style basic pre-tokenizer. Splits on whitespace and punctuation,
 * tracking absolute char offsets in the input. Each output `Word` is either
 * a run of non-whitespace / non-punctuation chars, or a single punctuation
 * character. Whitespace is discarded.
 */
function preTokenize(text: string): Word[] {
  const words: Word[] = [];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (isWhitespace(code)) {
      i++;
      continue;
    }
    if (isPunctuation(code)) {
      words.push({ text: text[i]!, start: i, end: i + 1 });
      i++;
      continue;
    }
    let j = i + 1;
    while (j < text.length) {
      const c = text.charCodeAt(j);
      if (isWhitespace(c) || isPunctuation(c)) break;
      j++;
    }
    words.push({ text: text.slice(i, j), start: i, end: j });
    i = j;
  }
  return words;
}

function isWhitespace(code: number): boolean {
  // Standard ASCII whitespace plus Unicode line/paragraph separators.
  return (
    code === 0x09 || // tab
    code === 0x0a || // LF
    code === 0x0b || // VT
    code === 0x0c || // FF
    code === 0x0d || // CR
    code === 0x20 || // space
    code === 0xa0 || // NBSP
    code === 0x2028 ||
    code === 0x2029
  );
}

function isPunctuation(code: number): boolean {
  // ASCII punctuation ranges.
  if (code >= 0x21 && code <= 0x2f) return true;
  if (code >= 0x3a && code <= 0x40) return true;
  if (code >= 0x5b && code <= 0x60) return true;
  if (code >= 0x7b && code <= 0x7e) return true;
  // Common Unicode punctuation we expect in Polish email text.
  if (code === 0x2013 || code === 0x2014) return true; // en/em dash
  if (code === 0x2018 || code === 0x2019) return true; // curly single quotes
  if (code === 0x201c || code === 0x201d) return true; // curly double quotes
  if (code === 0x2026) return true; // ellipsis
  return false;
}

/**
 * Apply CharBPE to a single word. Returns the final token list with offsets
 * relative to the start of the word (0-based). The caller adds the word's
 * absolute start offset to produce text-absolute offsets.
 */
function bpeEncodeWord(
  word: string,
  merges: MergeRanks,
  endOfWord: string,
): BpeToken[] {
  if (word.length === 0) return [];

  // Initial tokens: one per UTF-16 code unit. Last token gets </w> suffix.
  const tokens: BpeToken[] = [];
  for (let i = 0; i < word.length; i++) {
    tokens.push({ text: word[i]!, relStart: i, relEnd: i + 1 });
  }
  const lastToken = tokens[tokens.length - 1]!;
  lastToken.text = lastToken.text + endOfWord;

  // Iteratively merge the lowest-rank adjacent pair until no merge applies.
  // The `maxMerges` guard is purely defensive — each merge strictly reduces
  // token count so the loop cannot outrun the initial length.
  const maxMerges = tokens.length;
  for (let iter = 0; iter < maxMerges && tokens.length > 1; iter++) {
    let bestIdx = -1;
    let bestRank = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tokens.length - 1; i++) {
      const pairKey = `${tokens[i]!.text} ${tokens[i + 1]!.text}`;
      const rank = merges.get(pairKey);
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;

    const left = tokens[bestIdx]!;
    const right = tokens[bestIdx + 1]!;
    const merged: BpeToken = {
      text: left.text + right.text,
      relStart: left.relStart,
      relEnd: right.relEnd,
    };
    tokens.splice(bestIdx, 2, merged);
  }

  return tokens;
}

// --- decode -----------------------------------------------------------------

function decodeIds(
  ids: readonly number[],
  reverseVocab: ReadonlyMap<number, string>,
  specials: SpecialTokens,
): string {
  const specialIdStrings = new Set<string>([
    specials.cls,
    specials.sep,
    specials.pad,
  ]);

  const pieces: string[] = [];
  for (const id of ids) {
    const token = reverseVocab.get(id);
    if (token === undefined) continue;
    if (specialIdStrings.has(token)) continue;
    pieces.push(token);
  }

  // Tokens are character fragments; concatenate, then split on the
  // end-of-word marker to recover word boundaries.
  const joined = pieces.join('');
  if (!specials.endOfWord) return joined;

  return joined
    .split(specials.endOfWord)
    .map((s) => s)
    .filter((s) => s.length > 0)
    .join(' ');
}

// --- helpers ----------------------------------------------------------------

function resolveSpecialId(vocab: VocabMap, token: string): number {
  const id = vocab.get(token);
  if (id === undefined) {
    throw new Error(
      `Special token "${token}" is missing from the vocab map. ` +
        'Check that vocab.json contains the expected HerBERT special tokens.',
    );
  }
  return id;
}

function buildReverseVocab(vocab: VocabMap): ReadonlyMap<number, string> {
  const reverse = new Map<number, string>();
  for (const [token, id] of vocab) {
    reverse.set(id, token);
  }
  return reverse;
}
