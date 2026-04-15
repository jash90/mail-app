/**
 * BIO tag sequence → NER entity spans.
 *
 * Given the per-token predictions emitted by a HerBERT token classifier,
 * reconstruct contiguous entity spans with char offsets into the source
 * text. CLS / SEP / PAD tokens are dropped. Sub-word continuations (where
 * multiple BPE tokens belong to the same original word) are joined into a
 * single entity span.
 *
 * Defensive behaviour — real model output is noisy:
 *   - An `I-X` tag without a preceding `B-X` is treated as an implicit
 *     B-X (common misprediction at word boundaries; dropping it would
 *     under-mask PII).
 *   - An `I-Y` tag inside a running X entity closes X and starts a new Y
 *     — tag flips never silently merge across types.
 *   - Degenerate offsets (start === end) are skipped so special-token
 *     positions produced by the tokenizer never leak into entity spans.
 */

import type {
  BertEntity,
  BertLabel,
  BioLabelMap,
  BioTag,
  TokenOffset,
} from './bertTypes';

export interface DecodeBioInput {
  /** Original input text (needed to materialize entity.value). */
  readonly text: string;
  /** Per-token BIO tag strings, one per non-special token (same length as `tokenOffsets`). */
  readonly tokenTags: readonly BioTag[];
  /** Per-token char offsets in `text`. */
  readonly tokenOffsets: readonly TokenOffset[];
}

/**
 * Walk a BIO tag sequence and emit entity spans. Pure function — no side
 * effects, no I/O, deterministic for identical inputs.
 */
export function decodeBioTags(input: DecodeBioInput): BertEntity[] {
  const { text, tokenTags, tokenOffsets } = input;
  if (tokenTags.length !== tokenOffsets.length) {
    throw new Error(
      `decodeBioTags: tokenTags (${tokenTags.length}) and tokenOffsets (${tokenOffsets.length}) length mismatch`,
    );
  }

  const entities: BertEntity[] = [];
  let current: MutableEntity | null = null;

  for (let i = 0; i < tokenTags.length; i++) {
    const tag = tokenTags[i];
    const offset = tokenOffsets[i];

    // Skip degenerate spans (CLS / SEP / PAD positions produced by the
    // tokenizer) regardless of tag — they never correspond to source text.
    if (offset.start === offset.end) {
      continue;
    }

    if (tag === 'O') {
      if (current) {
        entities.push(finalizeEntity(current, text));
        current = null;
      }
      continue;
    }

    const parsed = parseBioTag(tag);
    if (!parsed) {
      // Malformed tag (e.g. custom label we don't recognize) — treat as O.
      if (current) {
        entities.push(finalizeEntity(current, text));
        current = null;
      }
      continue;
    }

    const { prefix, type } = parsed;

    if (prefix === 'B') {
      if (current) {
        entities.push(finalizeEntity(current, text));
      }
      current = { type, start: offset.start, end: offset.end };
      continue;
    }

    // prefix === 'I'
    if (current && current.type === type) {
      // Extend the running entity to cover this token's offset.
      current.end = offset.end;
      continue;
    }

    // Defensive: I-X without a matching running entity. Treat as implicit B-X.
    if (current) {
      entities.push(finalizeEntity(current, text));
    }
    current = { type, start: offset.start, end: offset.end };
  }

  if (current) {
    entities.push(finalizeEntity(current, text));
  }

  return entities;
}

/**
 * Build a `BioLabelMap` from a positional array of BIO tag strings. The
 * array index is used as the label id. Useful when the model config ships
 * `id2label` as an ordered JSON array.
 */
export function createBioLabelMap(ordering: readonly BioTag[]): BioLabelMap {
  const map = new Map<number, BioTag>();
  for (let i = 0; i < ordering.length; i++) {
    map.set(i, ordering[i]);
  }
  return map;
}

/**
 * Look up a label id in a `BioLabelMap`. Unknown ids fall back to `O` so a
 * corrupted / mis-shaped output row never throws — the token is simply
 * treated as non-entity.
 */
export function resolveBioLabel(
  labelMap: BioLabelMap,
  labelId: number,
): BioTag {
  return labelMap.get(labelId) ?? 'O';
}

// --- internal helpers -------------------------------------------------------

interface MutableEntity {
  type: BertLabel;
  start: number;
  end: number;
}

function finalizeEntity(m: MutableEntity, text: string): BertEntity {
  return {
    type: m.type,
    value: text.slice(m.start, m.end),
    start: m.start,
    end: m.end,
  };
}

interface ParsedTag {
  prefix: 'B' | 'I';
  type: BertLabel;
}

function parseBioTag(tag: BioTag): ParsedTag | null {
  // `O` is handled by the caller before this function runs; guard anyway.
  if (tag === 'O') return null;
  const dashIdx = tag.indexOf('-');
  if (dashIdx !== 1) return null;
  const prefix = tag.slice(0, 1);
  if (prefix !== 'B' && prefix !== 'I') return null;
  const type = tag.slice(2);
  if (type !== 'PER' && type !== 'LOC' && type !== 'ORG') return null;
  return { prefix, type };
}
