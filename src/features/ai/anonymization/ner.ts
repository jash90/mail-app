import type { Entity, EntityType } from './types';
import type { PlaceholderMap } from './placeholders';

/**
 * Model id used for NER. Indirected through this constant so the future swap
 * to a dedicated PII model (e.g. Tanaos Text Anonymizer v1 exported to GGUF)
 * is a single-line change: update the id here and the LOCAL_MODELS entry.
 *
 * Current model: Qwen 2.5 0.5B Instruct Q8_0 — a general-purpose small LLM
 * prompted to do NER. Per PII-Bench research, small-LLM NER (0.5B class)
 * achieves **F1 ~0.40–0.50** for prose names / places / orgs — substantially
 * weaker than the 7B+ class. Q8_0 chosen over Q4_K_M because quantization
 * loss is meaningful at this model scale.
 *
 * **This is the weak layer of the pipeline.** The post-pipeline regex
 * re-scan (`regexScan`) is the deterministic floor for structured PII
 * (email, PESEL, NIP, IBAN, phone, card, URL tokens). NER is additive —
 * it catches prose names at best-effort quality, but any NER miss on
 * structured identifiers is caught and hard-failed by the re-scan.
 *
 * **GDPR Art. 9 blind spot.** NER does not reliably recognize sensitive
 * topics (health, religion, sexual orientation, etc.) as context — and no
 * small local model will. The `sensitiveTopics` keyword gate in
 * `anonymizingCloud.ts` runs BEFORE this layer and hard-blocks cloud AI
 * when any Art. 9 keyword is present, forcing the user to the local
 * provider.
 */
export const NER_MODEL_ID = 'ner-qwen2.5-0.5b';

/**
 * NER prompt. Line-delimited output is used instead of JSON because small
 * LLMs fail at JSON far more often than at "one thing per line" formats.
 *
 * Kept extremely tight so the model doesn't waste tokens on pleasantries.
 */
const NER_SYSTEM =
  'You extract personal data from text. Output only the requested list.';

export function buildNerPrompt(text: string): string {
  return `Find all personal data in the text below. List each finding on its own line in the format TYPE: VALUE. Types: NAME, EMAIL, PHONE, PLACE, ORG, ID, OTHER. Output only the list, nothing else. If there is no personal data, output NONE.

Text: ${text}`;
}

export function getNerSystemPrompt(): string {
  return NER_SYSTEM;
}

/** Types the NER prompt is allowed to return. Anything else → `OTHER`. */
const NER_TYPES: ReadonlySet<string> = new Set<string>([
  'NAME',
  'EMAIL',
  'PHONE',
  'PLACE',
  'ORG',
  'ID',
  'OTHER',
]);

/**
 * Parse the line-delimited NER output into structured entities.
 *
 * Robust to:
 *   - blank lines, trailing whitespace
 *   - extra prose before/after the list
 *   - unknown type labels (coerced to `OTHER`)
 *   - `NONE` sentinel (returns empty)
 *
 * Malformed output never throws — the post-pipeline regex re-scan is the
 * deterministic safety net, so NER failures degrade gracefully to "NER
 * contributes nothing, regex still guarantees the structured floor".
 */
export function parseNerOutput(raw: string): Entity[] {
  const entities: Entity[] = [];
  if (!raw) return entities;

  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === 'NONE') return entities;

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const typeRaw = line.slice(0, colonIdx).trim().toUpperCase();
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    // Strip optional leading bullet/number ("- ", "1. ") from the type label
    // so slightly-chatty models still parse cleanly.
    const cleanedType = typeRaw.replace(/^[-*\d.\s]+/, '');

    const type = (
      NER_TYPES.has(cleanedType) ? cleanedType : 'OTHER'
    ) as EntityType;
    entities.push({ type, value });
  }

  return entities;
}

/**
 * Inference callback — takes a prompt, returns the raw model output.
 * Allows `applyNer` to stay pure and testable; the llama.rn-backed
 * implementation lives in `nerContext.ts`.
 */
export type NerInferenceFn = (
  prompt: string,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * Run NER on `text` via `runInference`, register entities in the shared
 * `map`, and return text with entities replaced by placeholder tokens.
 *
 * Contract:
 *   - Caller is responsible for holding the AI resource lock around this
 *     call (NER loads a llama.rn model → conflicts with local chat).
 *   - Map is mutated: new (type, value) pairs are allocated.
 *   - Replacement uses `map.applyForward` so values already seen in earlier
 *     messages reuse the same placeholder — no `<NAME_1>` vs `<NAME_3>`
 *     drift for the same person across a request.
 */
export async function applyNer(
  text: string,
  map: PlaceholderMap,
  runInference: NerInferenceFn,
  signal?: AbortSignal,
): Promise<string> {
  if (!text.trim()) return text;

  const prompt = buildNerPrompt(text);
  let raw: string;
  try {
    raw = await runInference(prompt, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    // NER inference failures are non-fatal — safety re-scan is the floor.
    // Log and return the input so the pipeline can continue.
    if (__DEV__) {
      console.warn('[ner] inference failed, continuing without NER:', err);
    }
    return text;
  }

  const entities = parseNerOutput(raw);
  for (const { type, value } of entities) {
    // Only register entities whose value actually appears in the text.
    // Models sometimes hallucinate; we don't want bogus map entries.
    if (text.includes(value)) {
      map.allocate(type, value);
    }
  }

  return map.applyForward(text);
}
