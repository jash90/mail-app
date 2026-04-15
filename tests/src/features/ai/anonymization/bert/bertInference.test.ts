import {
  runBertNer,
  type OnnxRunner,
  type OnnxTensorLike,
} from '@/src/features/ai/anonymization/bert/bertInference';
import { createBertTokenizer } from '@/src/features/ai/anonymization/bert/bertTokenizer';
import type {
  BioTag,
  MergeRanks,
  SpecialTokens,
  VocabMap,
} from '@/src/features/ai/anonymization/bert/bertTypes';
import { createBioLabelMap } from '@/src/features/ai/anonymization/bert/bertBioDecoder';

/**
 * End-to-end inference tests use the synthetic tokenizer from Step 1 plus a
 * hand-crafted runner that produces the logits we want. This keeps the test
 * deterministic, cheap, and completely independent of ONNX / native code.
 */

const SPECIAL_TOKENS: SpecialTokens = {
  cls: '<s>',
  sep: '</s>',
  pad: '<pad>',
  unk: '<unk>',
  mask: '<mask>',
  endOfWord: '</w>',
};

const LABEL_MAP = createBioLabelMap([
  'O',
  'B-PER',
  'I-PER',
  'B-LOC',
  'I-LOC',
  'B-ORG',
  'I-ORG',
]);
const NUM_LABELS = 7;

function buildVocab(): VocabMap {
  return new Map<string, number>([
    ['<s>', 0],
    ['</s>', 1],
    ['<pad>', 2],
    ['<unk>', 3],
    ['<mask>', 4],
    ['a', 10],
    ['b', 11],
    ['c', 12],
    ['d', 13],
    ['a</w>', 20],
    ['b</w>', 21],
    ['c</w>', 22],
    ['d</w>', 23],
  ]);
}

const EMPTY_MERGES: MergeRanks = new Map();

function buildTokenizer() {
  return createBertTokenizer(buildVocab(), EMPTY_MERGES, {
    specialTokens: SPECIAL_TOKENS,
  });
}

/**
 * Build a `[1, seqLen, numLabels]` float32 logits tensor where each token
 * has its predicted label as the argmax. The per-token "winning" label is
 * given by `labelPerToken`; all other positions get 0.0 and the winner gets
 * 10.0, which is strictly greater.
 */
function makeLogits(labelPerToken: readonly number[]): OnnxTensorLike {
  const seqLen = labelPerToken.length;
  const data = new Float32Array(seqLen * NUM_LABELS);
  for (let t = 0; t < seqLen; t++) {
    data[t * NUM_LABELS + labelPerToken[t]] = 10;
  }
  return { data, dims: [1, seqLen, NUM_LABELS] };
}

/**
 * Minimal runner: records how it was called and returns a fixed logits
 * tensor. No ONNX / native dependencies.
 */
function makeRunner(
  logitsForCall: OnnxTensorLike,
  logitsOutputName = 'logits',
): {
  runner: OnnxRunner;
  lastFeeds: { value: Readonly<Record<string, OnnxTensorLike>> | null };
} {
  const lastFeeds: {
    value: Readonly<Record<string, OnnxTensorLike>> | null;
  } = { value: null };
  const runner: OnnxRunner = {
    async run(feeds) {
      lastFeeds.value = feeds;
      return { [logitsOutputName]: logitsForCall };
    },
    makeInt64Tensor(data, dims) {
      return { data, dims };
    },
  };
  return { runner, lastFeeds };
}

describe('runBertNer', () => {
  it('returns no entities when every token is labelled O', async () => {
    const tokenizer = buildTokenizer();
    // "ab" encodes to [CLS, a, b</w>, SEP] → 4 tokens.
    const logits = makeLogits([0, 0, 0, 0]);
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([]);
  });

  it('decodes a single LOC entity across token boundaries', async () => {
    const tokenizer = buildTokenizer();
    // "ab" → [CLS, a, b</w>, SEP]. Tag as [O, B-LOC, I-LOC, O].
    // Expected entity span: "ab" at [0, 2).
    const logits = makeLogits([0, 3, 4, 0]); // 0=O, 3=B-LOC, 4=I-LOC
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([{ type: 'LOC', value: 'ab', start: 0, end: 2 }]);
  });

  it('handles multiple entities of different types in one input', async () => {
    const tokenizer = buildTokenizer();
    // "ab cd" → [CLS, a, b</w>, c, d</w>, SEP] = 6 tokens.
    // Tag: [O, B-PER, I-PER, B-ORG, I-ORG, O]
    const logits = makeLogits([0, 1, 2, 5, 6, 0]);
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab cd', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([
      { type: 'PER', value: 'ab', start: 0, end: 2 },
      { type: 'ORG', value: 'cd', start: 3, end: 5 },
    ]);
  });

  it('builds input_ids / attention_mask / token_type_ids feeds', async () => {
    const tokenizer = buildTokenizer();
    const logits = makeLogits([0, 0, 0, 0]);
    const { runner, lastFeeds } = makeRunner(logits);

    await runBertNer('ab', tokenizer, runner, { labelMap: LABEL_MAP });

    const feeds = lastFeeds.value;
    expect(feeds).not.toBeNull();
    expect(Object.keys(feeds!).sort()).toEqual([
      'attention_mask',
      'input_ids',
      'token_type_ids',
    ]);
    expect(feeds!.input_ids.dims).toEqual([1, 4]);
    expect(feeds!.attention_mask.dims).toEqual([1, 4]);
    expect(feeds!.token_type_ids.dims).toEqual([1, 4]);
  });

  it('respects overridden input and output tensor names', async () => {
    const tokenizer = buildTokenizer();
    const logits = makeLogits([0, 0, 0, 0]);
    const { runner, lastFeeds } = makeRunner(logits, 'my_logits');

    await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
      inputNames: {
        inputIds: 'my_input_ids',
        attentionMask: 'my_mask',
        tokenTypeIds: 'my_types',
      },
      logitsOutputName: 'my_logits',
    });

    expect(Object.keys(lastFeeds.value!).sort()).toEqual([
      'my_input_ids',
      'my_mask',
      'my_types',
    ]);
  });

  it('throws when the runner output is missing the logits tensor', async () => {
    const tokenizer = buildTokenizer();
    const runner: OnnxRunner = {
      async run() {
        return {};
      },
      makeInt64Tensor(data, dims) {
        return { data, dims };
      },
    };

    await expect(
      runBertNer('ab', tokenizer, runner, { labelMap: LABEL_MAP }),
    ).rejects.toThrow(/missing "logits"/);
  });

  it('throws when the logits tensor has an unexpected shape', async () => {
    const tokenizer = buildTokenizer();
    // Missing the batch dim.
    const logits: OnnxTensorLike = {
      data: new Float32Array(14),
      dims: [4, NUM_LABELS],
    };
    const { runner } = makeRunner(logits);

    await expect(
      runBertNer('ab', tokenizer, runner, { labelMap: LABEL_MAP }),
    ).rejects.toThrow(/expected \[1, seqLen, numLabels\]/);
  });

  it('throws when logits data length does not match dims', async () => {
    const tokenizer = buildTokenizer();
    const logits: OnnxTensorLike = {
      data: new Float32Array(5),
      dims: [1, 4, NUM_LABELS],
    };
    const { runner } = makeRunner(logits);

    await expect(
      runBertNer('ab', tokenizer, runner, { labelMap: LABEL_MAP }),
    ).rejects.toThrow(/does not match dims/);
  });

  it('truncates long input to the configured max sequence length', async () => {
    const tokenizer = buildTokenizer();
    // Build a 10-token encoding via repetition: "ab ab ab ab" → CLS + 2 words
    // × 2 tokens each × ... actually, let's just use a smaller maxSeqLen.
    // "ab cd" is 6 tokens; cap at 4 → CLS, a, b</w>, SEP (forced).
    const logits = makeLogits([0, 0, 0, 0]);
    const { runner, lastFeeds } = makeRunner(logits);

    await runBertNer('ab cd', tokenizer, runner, {
      labelMap: LABEL_MAP,
      maxSeqLen: 4,
    });

    const feeds = lastFeeds.value!;
    expect(feeds.input_ids.dims).toEqual([1, 4]);
    // The last id must be SEP (id=1) after truncation.
    const ids = feeds.input_ids.data as ArrayLike<number | bigint>;
    const lastId = Number(ids[ids.length - 1] as number | bigint);
    expect(lastId).toBe(1);
  });

  it('falls back to O when logits argmax lands on an unknown label id', async () => {
    const tokenizer = buildTokenizer();
    // Only provide 3 label slots even though LABEL_MAP knows 7. The
    // argmax picks label 2 (I-PER). Build a deliberately oversized logits
    // tensor so the argmax hits label 99 → unknown → O fallback.
    const seqLen = 4;
    const narrowLabels = 100;
    const data = new Float32Array(seqLen * narrowLabels);
    for (let t = 0; t < seqLen; t++) {
      data[t * narrowLabels + 99] = 1; // argmax → 99
    }
    const logits: OnnxTensorLike = { data, dims: [1, seqLen, narrowLabels] };
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    // Label 99 is unknown → resolveBioLabel returns 'O' → no entities.
    expect(entities).toEqual([]);
  });

  it('supports bigint-typed logits data (int-quantized outputs)', async () => {
    const tokenizer = buildTokenizer();
    // Some quantized exports emit int-typed logits. The argmax must still
    // work via bigint → number conversion.
    const seqLen = 4;
    const data: bigint[] = [];
    const winners: readonly number[] = [0, 1, 2, 0];
    for (let t = 0; t < seqLen; t++) {
      for (let c = 0; c < NUM_LABELS; c++) {
        data.push(c === winners[t] ? 10n : 0n);
      }
    }
    const logits: OnnxTensorLike = { data, dims: [1, seqLen, NUM_LABELS] };
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([{ type: 'PER', value: 'ab', start: 0, end: 2 }]);
  });

  it('uses the default HerBERT label map when none is provided', async () => {
    const tokenizer = buildTokenizer();
    const logits = makeLogits([0, 3, 4, 0]); // 3=B-LOC, 4=I-LOC
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('ab', tokenizer, runner);
    expect(entities).toEqual([{ type: 'LOC', value: 'ab', start: 0, end: 2 }]);
  });

  it('short-circuits to empty output when the text produces no non-special tokens', async () => {
    const tokenizer = buildTokenizer();
    // Empty input → just [CLS, SEP]. Both have degenerate offsets and the
    // decoder skips them regardless of tag.
    const logits = makeLogits([0, 0]);
    const { runner } = makeRunner(logits);

    const entities = await runBertNer('', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([]);
  });

  // Sanity check — a plausible BIO label id that we let the runner emit
  // even with the weakest possible logits (all tied at zero) must resolve
  // to the first label (id 0 = O) because of how argmax iterates.
  it('breaks argmax ties by choosing the earliest (lowest-index) label', async () => {
    const tokenizer = buildTokenizer();
    const logits: OnnxTensorLike = {
      data: new Float32Array(4 * NUM_LABELS), // all zero
      dims: [1, 4, NUM_LABELS],
    };
    const { runner } = makeRunner(logits);
    const entities = await runBertNer('ab', tokenizer, runner, {
      labelMap: LABEL_MAP,
    });
    expect(entities).toEqual([]);
  });
});

describe('BIO label id mapping', () => {
  it('exposes the seven default HerBERT labels', () => {
    expect(LABEL_MAP.get(0)).toBe('O');
    expect(LABEL_MAP.get(1)).toBe('B-PER');
    expect(LABEL_MAP.get(6)).toBe('I-ORG');
    expect(LABEL_MAP.size).toBe(7);
  });

  it('uses idx as label id in createBioLabelMap ordering', () => {
    const custom: readonly BioTag[] = ['O', 'B-PER'];
    const map = createBioLabelMap(custom);
    expect(map.get(0)).toBe('O');
    expect(map.get(1)).toBe('B-PER');
  });
});
