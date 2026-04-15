/**
 * BERT NER inference pipeline (tokenize → run ONNX → decode BIO → entities).
 *
 * This module is a pure orchestration layer. It takes the building blocks
 * as dependency arguments:
 *   - a `BertTokenizer` to encode text
 *   - an `OnnxRunner` (abstracted `InferenceSession.run`) to execute the model
 *   - a `BioLabelMap` to translate raw label ids to BIO tags
 *   - the tokenizer factory exposes an `EncodeOutput`; we forward offsets
 *     straight to the BIO decoder so char spans stay accurate
 *
 * Dependency-injecting the runner lets tests substitute a hand-crafted
 * logits matrix without touching `onnxruntime-react-native`.
 *
 * Tensor shapes (matches HuggingFace token-classification ONNX export):
 *   input_ids:        int64 [1, seqLen]
 *   attention_mask:   int64 [1, seqLen]
 *   token_type_ids:   int64 [1, seqLen]     (all zeros for single sentence)
 *   logits (output):  float32 [1, seqLen, numLabels]
 */

import type {
  BertEntity,
  BertTokenizer,
  BioLabelMap,
  BioTag,
  EncodedText,
  TokenOffset,
} from './bertTypes';
import { DEFAULT_BIO_LABEL_MAP } from './bertTypes';
import { decodeBioTags, resolveBioLabel } from './bertBioDecoder';

/**
 * Minimal subset of `InferenceSession.run` we actually need. Narrower than
 * the full ORT interface so mocks in tests can be ~10 lines.
 */
export interface OnnxTensorLike {
  readonly data: ArrayLike<number | bigint>;
  readonly dims: readonly number[];
}

export interface OnnxRunner {
  /**
   * Execute the model with a map of named input tensors. Returns a map of
   * named output tensors. Output shape for `logits` is [1, seqLen, numLabels].
   */
  run(
    feeds: Readonly<Record<string, OnnxTensorLike>>,
  ): Promise<Record<string, OnnxTensorLike>>;
  /**
   * Build an int64 tensor with the given 2D shape. Implementations wrap
   * `new Tensor('int64', BigInt64Array.from(...), dims)`; tests can use a
   * plain object conforming to `OnnxTensorLike`.
   */
  makeInt64Tensor(
    data: readonly bigint[],
    dims: readonly number[],
  ): OnnxTensorLike;
}

export interface BertInferenceOptions {
  /**
   * Override the default HerBERT label map. Callers using a model with a
   * reordered head supply their own `createBioLabelMap([...])`.
   */
  readonly labelMap?: BioLabelMap;
  /**
   * Names of the input tensors the model expects. Some exports rename
   * these; HerBERT ONNX from `optimum-cli` uses the defaults below.
   */
  readonly inputNames?: {
    readonly inputIds?: string;
    readonly attentionMask?: string;
    readonly tokenTypeIds?: string;
  };
  /** Output tensor name for logits. Defaults to `logits`. */
  readonly logitsOutputName?: string;
  /**
   * Max sequence length enforced by truncating encoded input. HerBERT base
   * is positional to 512; we cap at 512 by default to avoid OOR errors.
   */
  readonly maxSeqLen?: number;
}

const DEFAULT_INPUT_NAMES = {
  inputIds: 'input_ids',
  attentionMask: 'attention_mask',
  tokenTypeIds: 'token_type_ids',
} as const;

const DEFAULT_LOGITS_OUTPUT = 'logits';
const DEFAULT_MAX_SEQ_LEN = 512;

/**
 * Run the full BERT NER inference pipeline on a single text input.
 *
 * Returns the list of detected entities (PER / LOC / ORG) with char offsets
 * into `text`. Long inputs are truncated to `maxSeqLen` tokens; the SEP
 * marker is always preserved as the last token so the model sees a
 * well-formed sequence.
 *
 * Throws if the runner fails or the logits output is missing / mis-shaped.
 */
export async function runBertNer(
  text: string,
  tokenizer: BertTokenizer,
  runner: OnnxRunner,
  options: BertInferenceOptions = {},
): Promise<BertEntity[]> {
  const labelMap = options.labelMap ?? DEFAULT_BIO_LABEL_MAP;
  const inputNames = { ...DEFAULT_INPUT_NAMES, ...(options.inputNames ?? {}) };
  const logitsName = options.logitsOutputName ?? DEFAULT_LOGITS_OUTPUT;
  const maxSeqLen = options.maxSeqLen ?? DEFAULT_MAX_SEQ_LEN;

  const encoded = tokenizer.encode(text);
  const truncated = truncate(encoded, maxSeqLen, tokenizer.sepTokenId);

  const feeds = buildFeeds(truncated.ids, runner, inputNames);
  const outputs = await runner.run(feeds);

  const logits = outputs[logitsName];
  if (!logits) {
    throw new Error(
      `runBertNer: runner output missing "${logitsName}" tensor (got ${Object.keys(outputs).join(', ') || 'nothing'})`,
    );
  }

  const tokenTags = argmaxLogitsToTags(logits, labelMap);
  // Skip CLS at index 0 and SEP at the last index: both have degenerate
  // offsets so the decoder filters them anyway, but stripping them here
  // keeps the intermediate arrays aligned with the token sequence.
  return decodeBioTags({
    text,
    tokenTags,
    tokenOffsets: truncated.offsets,
  });
}

/**
 * Default `OnnxRunner` that wraps an `onnxruntime-react-native`
 * `InferenceSession`. Kept separate from `runBertNer` so tests can swap
 * in a lightweight stub runner without touching ONNX at all.
 */
export function createOnnxRunner(
  session: import('onnxruntime-react-native').InferenceSession,
): OnnxRunner {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ort =
    require('onnxruntime-react-native') as typeof import('onnxruntime-react-native');

  return {
    async run(feeds) {
      const nativeFeeds: Record<
        string,
        import('onnxruntime-react-native').Tensor
      > = {};
      for (const [name, tensor] of Object.entries(feeds)) {
        nativeFeeds[name] =
          tensor as unknown as import('onnxruntime-react-native').Tensor;
      }
      const raw = await session.run(nativeFeeds);
      const out: Record<string, OnnxTensorLike> = {};
      for (const [name, tensor] of Object.entries(raw)) {
        out[name] = tensor as unknown as OnnxTensorLike;
      }
      return out;
    },
    makeInt64Tensor(data, dims) {
      return new ort.Tensor(
        'int64',
        BigInt64Array.from(data),
        dims,
      ) as unknown as OnnxTensorLike;
    },
  };
}

// --- internals --------------------------------------------------------------

interface TruncatedEncoding {
  readonly ids: number[];
  readonly offsets: TokenOffset[];
}

function truncate(
  encoded: EncodedText,
  maxSeqLen: number,
  sepTokenId: number,
): TruncatedEncoding {
  if (encoded.ids.length <= maxSeqLen) {
    return {
      ids: [...encoded.ids],
      offsets: [...encoded.offsets],
    };
  }
  // Keep the first (maxSeqLen - 1) tokens, then force the SEP at the end so
  // the model always sees a well-formed boundary. Offset for the forced SEP
  // collapses to the last retained token's end position.
  const ids = encoded.ids.slice(0, maxSeqLen - 1);
  const offsets = encoded.offsets.slice(0, maxSeqLen - 1);
  ids.push(sepTokenId);
  const lastEnd = offsets.length > 0 ? offsets[offsets.length - 1].end : 0;
  offsets.push({ start: lastEnd, end: lastEnd });
  return { ids, offsets };
}

function buildFeeds(
  ids: readonly number[],
  runner: OnnxRunner,
  names: Required<NonNullable<BertInferenceOptions['inputNames']>>,
): Record<string, OnnxTensorLike> {
  const seqLen = ids.length;
  const idsBig = ids.map((id) => BigInt(id));
  const maskBig = new Array<bigint>(seqLen).fill(1n);
  const typeBig = new Array<bigint>(seqLen).fill(0n);

  return {
    [names.inputIds]: runner.makeInt64Tensor(idsBig, [1, seqLen]),
    [names.attentionMask]: runner.makeInt64Tensor(maskBig, [1, seqLen]),
    [names.tokenTypeIds]: runner.makeInt64Tensor(typeBig, [1, seqLen]),
  };
}

/**
 * Convert the `[1, seqLen, numLabels]` logits tensor to a per-token BIO
 * tag sequence via argmax over the label dimension.
 */
function argmaxLogitsToTags(
  logits: OnnxTensorLike,
  labelMap: BioLabelMap,
): BioTag[] {
  if (logits.dims.length !== 3 || logits.dims[0] !== 1) {
    throw new Error(
      `runBertNer: unexpected logits shape ${JSON.stringify(logits.dims)}; expected [1, seqLen, numLabels]`,
    );
  }
  const seqLen = logits.dims[1];
  const numLabels = logits.dims[2];
  const data = logits.data;
  if (data.length !== seqLen * numLabels) {
    throw new Error(
      `runBertNer: logits data length ${data.length} does not match dims ${seqLen}×${numLabels}`,
    );
  }

  const tags: BioTag[] = new Array(seqLen);
  for (let t = 0; t < seqLen; t++) {
    let bestIdx = 0;
    let bestVal = toNumber(data[t * numLabels]);
    for (let c = 1; c < numLabels; c++) {
      const v = toNumber(data[t * numLabels + c]);
      if (v > bestVal) {
        bestVal = v;
        bestIdx = c;
      }
    }
    tags[t] = resolveBioLabel(labelMap, bestIdx);
  }
  return tags;
}

function toNumber(v: number | bigint): number {
  return typeof v === 'bigint' ? Number(v) : v;
}
