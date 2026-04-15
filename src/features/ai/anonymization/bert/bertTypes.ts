/**
 * Types for the BERT NER layer of the hybrid anonymization pipeline.
 *
 * The tokenizer is the first module to land (Step 1 of the build sequence in
 * `docs/plan`). The inference / BIO-decode / session modules will add their
 * own types to this file as they come in.
 *
 * Design notes:
 *   - `TokenOffset` uses UTF-16 code unit indices (same as JS `String.length`
 *     and `String.slice`). Polish diacritics are single units in UTF-16 so
 *     offsets map cleanly to char spans for NER. Surrogate-pair emoji would
 *     encode as two tokens with half-offsets, which is acceptable — the NER
 *     layer never tags emoji anyway.
 *   - `VocabMap` / `MergeRanks` are read-only maps so a single tokenizer
 *     instance can be shared across concurrent calls without defensive clones.
 *   - Special-token strings are configurable (HerBERT uses `<s>`/`</s>`/`</w>`
 *     per RoBERTa convention; other BPE models may differ).
 */

/** Character span in the original input text, end-exclusive. */
export interface TokenOffset {
  readonly start: number;
  readonly end: number;
}

/** Output of `BertTokenizer.encode`: parallel arrays of ids and offsets. */
export interface EncodedText {
  readonly ids: number[];
  readonly offsets: TokenOffset[];
}

/** Token string → vocab id. */
export type VocabMap = ReadonlyMap<string, number>;

/**
 * BPE merge rank table. Keys are `${first} ${second}` (space-separated pair
 * as it appears in `merges.txt`). Lower rank = higher priority (merged first).
 */
export type MergeRanks = ReadonlyMap<string, number>;

/**
 * Special-token strings used by the tokenizer. Must match the strings used
 * when the model was trained. HerBERT / RoBERTa defaults shipped below.
 */
export interface SpecialTokens {
  readonly cls: string;
  readonly sep: string;
  readonly pad: string;
  readonly unk: string;
  readonly mask: string;
  /**
   * End-of-word marker appended to the last character of each word before
   * BPE merging. HerBERT CharBPE uses `</w>`; byte-level BPE models like
   * GPT-2 do not use this mechanism.
   */
  readonly endOfWord: string;
}

/** Default HerBERT-compatible special tokens. */
export const DEFAULT_SPECIAL_TOKENS: SpecialTokens = Object.freeze({
  cls: '<s>',
  sep: '</s>',
  pad: '<pad>',
  unk: '<unk>',
  mask: '<mask>',
  endOfWord: '</w>',
});

/**
 * Public tokenizer interface. One instance per model. Instances are
 * effectively immutable after construction — safe to share across calls.
 */
export interface BertTokenizer {
  /**
   * Encode a UTF-16 string to vocab ids with char-span offsets.
   *
   * Adds `<s>` at the start and `</s>` at the end. Special-token offsets are
   * degenerate ranges (start === end) pointing at text boundaries, matching
   * HuggingFace `return_offsets_mapping=True` convention.
   */
  encode(text: string): EncodedText;

  /**
   * Decode vocab ids back to a best-effort reconstruction of the source
   * text. Special tokens (CLS / SEP / PAD) are stripped. Word boundaries
   * are inferred from the end-of-word marker — the result is useful for
   * debugging but not byte-equal to the original input.
   */
  decode(ids: readonly number[]): string;

  readonly vocabSize: number;
  readonly clsTokenId: number;
  readonly sepTokenId: number;
  readonly padTokenId: number;
  readonly unkTokenId: number;
}

/**
 * Entity labels produced by the BERT NER layer. These are the raw 3-class
 * outputs of `pietruszkowiec/herbert-base-ner` (and similar Polish HerBERT
 * NER fine-tunes). The orchestrator translates them into canonical anon
 * placeholder types (`PERSON` / `LOCATION` / `ORGANIZATION`) at the fusion
 * boundary.
 */
export type BertLabel = 'PER' | 'LOC' | 'ORG';

/**
 * Named entity detected by the BERT NER layer.
 *
 * `start` / `end` are char offsets into the original input text (UTF-16
 * units, end-exclusive). `value` is the literal substring — kept alongside
 * the offsets so downstream consumers don't need the source text to mask.
 */
export interface BertEntity {
  readonly type: BertLabel;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/**
 * BIO tag string produced per token. `O` means not part of any entity;
 * `B-{LABEL}` starts a new entity; `I-{LABEL}` continues the current one.
 */
export type BioTag = 'O' | `B-${BertLabel}` | `I-${BertLabel}`;

/**
 * Per-class id → label mapping, as produced by `transformers` model config.
 * Keys are label ids (integers from 0), values are BIO tag strings.
 */
export type BioLabelMap = ReadonlyMap<number, BioTag>;

/**
 * Default HerBERT 3-class BIO label map (O, B-PER, I-PER, B-LOC, I-LOC,
 * B-ORG, I-ORG). Matches the `id2label` in `pietruszkowiec/herbert-base-ner`
 * and `pczarnik/herbert-base-ner` config.json. If a different model ships
 * with a reordered head, override via `createBertLabelMap(ordering)`.
 */
export const DEFAULT_BIO_LABEL_MAP: BioLabelMap = new Map<number, BioTag>([
  [0, 'O'],
  [1, 'B-PER'],
  [2, 'I-PER'],
  [3, 'B-LOC'],
  [4, 'I-LOC'],
  [5, 'B-ORG'],
  [6, 'I-ORG'],
]);

/**
 * Callable form of the BERT inference entry point. Dependency-injected so
 * callers can swap the real ONNX pipeline for a mock in tests.
 */
export type BertInferenceFn = (
  text: string,
  signal?: AbortSignal,
) => Promise<BertEntity[]>;
