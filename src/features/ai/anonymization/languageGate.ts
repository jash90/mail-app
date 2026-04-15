import { franc } from 'franc-min';

/**
 * Language detection gate for the anonymization pipeline.
 *
 * The sensitive-topic keyword list (`sensitiveTopics.ts`) covers only
 * Polish and English. If a user writes an email in German, Spanish, or
 * any other language, our keyword gate silently fails — the Art. 9 /
 * Art. 10 detection returns empty even if the text literally says
 * "ich habe Diabetes".
 *
 * This gate runs before the sensitive-topic check and refuses the cloud
 * call for any detected language outside the supported set. `und`
 * (undetermined — text too short or ambiguous) is allowed because
 * `franc-min` returns `und` for many short but legitimate English/Polish
 * snippets.
 *
 * Caller: `anonymizingCloud.generate` and `anonymizePayloadForCloud`.
 */

export type SupportedLanguage = 'pol' | 'eng' | 'und';

const SUPPORTED: ReadonlySet<string> = new Set<SupportedLanguage>([
  'pol',
  'eng',
  'und',
]);

/**
 * Detect the language of `text`. Returns a 3-letter ISO 639-3 code.
 * Pure wrapper over `franc-min` so call sites don't couple to the library.
 */
export function detectLanguage(text: string): string {
  if (!text || text.trim().length < 20) return 'und';
  return franc(text, { minLength: 20 });
}

/**
 * Returns true if `text` is in a language the keyword gate understands
 * (Polish, English, or too-short-to-tell).
 */
export function isSupportedLanguage(text: string): boolean {
  return SUPPORTED.has(detectLanguage(text));
}
