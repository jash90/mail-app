import type { AiProvider, ChatMessage, GenerateOptions } from '../types';
import { cloudProvider } from './cloud';
import {
  anonymizeMessages,
  deAnonymize,
  regexScan,
  PlaceholderMap,
} from '../anonymization';
import { detectSensitiveCategories } from '../anonymization/sensitiveTopics';
import {
  detectLanguage,
  isSupportedLanguage,
} from '../anonymization/languageGate';
import {
  isNerModelReady,
  runNerInference,
  NerModelNotInstalledError,
} from '../anonymization/nerContext';
import { acquireAI } from '@/src/shared/services/resourceLock';
import { AIProviderError } from '@/src/shared/services/errors';

export interface AnonymizedPayload {
  anonMessages: ChatMessage[];
  map: PlaceholderMap;
}

/**
 * Cloud provider wrapper that runs the anonymization pipeline on every
 * outgoing message before the network call and reverses the map on the
 * response.
 *
 * Pipeline per `generate` call:
 *   1a. Language gate — refuse non-PL/EN (sensitive-topic keyword list
 *       only covers PL+EN, so other languages would silently bypass).
 *   1b. Sensitive-topic gate — refuse Art. 9/10 content (health, religion,
 *       political opinion, criminal record, etc.) — cloud cannot process
 *       these regardless of anonymization.
 *   2.  **NER is OPTIONAL.** If the PII Detector model is installed,
 *       acquire the AI lock and run NER. Otherwise run regex-only: the
 *       deterministic regex floor + quote strip + role-tag seeding + safety
 *       re-scan is the full pipeline. Prose names leak in regex-only mode;
 *       structured PII never does.
 *   3.  Full pipeline: strip → regex → (optional NER) → role tags.
 *   4.  Safety re-scan: `regexScan` on every non-system message. Hard-fail
 *       with `ANONYMIZATION_LEAK` if any structured PII survives.
 *   5.  Delegate to `cloudProvider.generate` with anonymized payload.
 *   6.  De-anonymize the response via the shared map so the user sees
 *       real names in summaries, generated replies, etc.
 */
export const anonymizingCloudProvider: AiProvider = {
  name: 'cloud',

  async generate(
    messages: ChatMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    // 1a. Language gate
    assertSupportedLanguage(messages);

    // 1b. Sensitive-topic gate — Art. 9/10 hard-block before any work
    assertNoSensitiveTopics(messages);

    // 2. NER is optional. If the PII Detector model is installed, use it.
    //    If not, run regex-only — still strong for structured PII, which
    //    is the real security guarantee. Prose names leak in regex-only
    //    mode (documented trade-off).
    const useNer = isNerModelReady();
    let releaseAI: (() => void) | null = null;
    if (useNer) {
      releaseAI = await acquireAI(options?.signal);
    }

    let anonResult: Awaited<ReturnType<typeof anonymizeMessages>>;
    try {
      anonResult = await anonymizeMessages(messages, {
        signal: options?.signal,
        ctx: options?.ctx,
        ...(useNer ? { runNerInference } : {}),
      });
    } catch (err) {
      releaseAI?.();
      if (err instanceof NerModelNotInstalledError) {
        // Race: model was removed between `isNerModelReady()` and the
        // actual inference call. Fall back to regex-only by re-running
        // without the NER hook.
        anonResult = await anonymizeMessages(messages, {
          signal: options?.signal,
          ctx: options?.ctx,
        });
      } else {
        throw err;
      }
    }

    // Release AI lock (no-op if we never acquired it)
    releaseAI?.();

    const { anonMessages, map } = anonResult;

    // 5. Safety re-scan — deterministic floor. Any structured PII that
    //    survives the pipeline means the request is refused.
    assertNoLeaks(anonMessages);

    // 5b. Entropy / length-drop soft warning. Catches catastrophic
    //     pipeline regressions in dev (e.g. someone wires around the
    //     regex layer). Not a hard block — just a log line.
    warnOnSuspiciousLengthDrop(messages, anonMessages);

    // 6. Delegate to cloud with anonymized payload
    const response = await cloudProvider.generate(anonMessages, options);

    // 7. Restore real values in the response
    return deAnonymize(response, map);
  },
};

/**
 * Soft warning for suspicious length-drop behavior.
 *
 * When a long original message contains obvious PII markers (e.g. `@`
 * for email, `+48` for phone) but the anonymized output has dropped
 * less than 1% in length, something in the pipeline is likely broken.
 * Logs a `[anon] suspicious` warning in __DEV__ so the test/dev cycle
 * surfaces catastrophic regressions before they reach prod.
 *
 * Not a hard block — the regex re-scan is already the hard guarantee.
 * This is just a belt-and-braces sanity check.
 */
function warnOnSuspiciousLengthDrop(
  original: ChatMessage[],
  anonymized: ChatMessage[],
): void {
  if (!__DEV__) return;
  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const anon = anonymized[i];
    if (!orig || !anon) continue;
    if (orig.role === 'system') continue;
    if (orig.content.length < 200) continue;

    // Heuristic markers suggesting PII was present:
    const hasObviousPII =
      /@/.test(orig.content) ||
      /\+48/.test(orig.content) ||
      /\b\d{11}\b/.test(orig.content);
    if (!hasObviousPII) continue;

    const dropRatio = 1 - anon.content.length / orig.content.length;
    if (dropRatio < 0.01) {
      console.warn(
        `[anon] suspicious: message ${i} had PII markers but anonymization reduced length by ${(dropRatio * 100).toFixed(1)}%. Verify pipeline.`,
      );
    }
  }
}

function assertNoLeaks(messages: ChatMessage[]): void {
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const leaks = regexScan(msg.content);
    if (leaks.length > 0) {
      const types = [...new Set(leaks.map((l) => l.type))].join(', ');
      throw new AIProviderError(
        'ANONYMIZATION_LEAK',
        `Anonymization pipeline left ${leaks.length} PII match(es) in output (${types}) — refusing cloud call`,
      );
    }
  }
}

/**
 * Language gate — refuse cloud AI for any language outside PL/EN.
 *
 * Rationale: the sensitive-topic keyword list (`sensitiveTopics.ts`)
 * only covers Polish and English. If a user writes an email in any
 * other language, the `assertNoSensitiveTopics` check would silently
 * pass even for text that literally says "ich habe Diabetes" — the
 * keyword `diabetes` in German wouldn't match. Blocking unsupported
 * languages is the safe default.
 *
 * `und` (undetermined — text too short) is accepted because franc-min
 * returns `und` for many legitimate short PL/EN snippets.
 */
function assertSupportedLanguage(messages: ChatMessage[]): void {
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (!isSupportedLanguage(msg.content)) {
      const lang = detectLanguage(msg.content);
      throw new AIProviderError(
        'ANONYMIZATION_UNSUPPORTED_LANGUAGE',
        `Cloud AI disabled: detected language '${lang}'. Pipeline only supports Polish and English — others may leak PII via the sensitive-topic gate. Switch to local provider or translate the content.`,
      );
    }
  }
}

/**
 * GDPR Art. 9 sensitive-topic gate.
 *
 * Runs on the ORIGINAL pre-anonymization user content. If any message
 * contains a keyword from the sensitive-topic list (health, religion,
 * sexual orientation, political opinion, ethnic origin, biometric/genetic,
 * trade union membership), the cloud call is refused.
 *
 * Rationale: there is no meaningful way to anonymize "the patient has
 * diabetes" — the statement itself is the sensitive fact. Anonymizing
 * the patient's name does not change the sensitive *context*. The only
 * honest posture is to refuse cloud AI and force the user to use a
 * local-only provider for sensitive conversations.
 *
 * False positives are accepted by design — safer to over-block than
 * leak regulated data.
 */
function assertNoSensitiveTopics(messages: ChatMessage[]): void {
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const categories = detectSensitiveCategories(msg.content);
    if (categories.length > 0) {
      throw new AIProviderError(
        'ANONYMIZATION_SENSITIVE_TOPIC',
        `Cloud AI is disabled for this message — detected sensitive content (${categories.join(', ')}). Switch to the local provider to process it.`,
      );
    }
  }
}

/**
 * Phase 1 of a batched cloud call: run the full anonymization pipeline
 * (strip → regex → NER → role tags) + the safety re-scan, WITHOUT
 * acquiring/releasing the AI resource lock or making the cloud call.
 *
 * Caller responsibilities:
 *   - Hold the AI resource lock for the duration of this call (NER needs
 *     llama.rn, which conflicts with local chat inference).
 *   - Check `isNerModelReady()` before calling — this function will throw
 *     `ANONYMIZATION_MODEL_MISSING` if the NER model is absent.
 *
 * Intended for `prefetchSummaries` batch mode, where holding the lock
 * across 20 anonymizations amortizes the ~3–5s NER cold start.
 */
export async function anonymizePayloadForCloud(
  messages: ChatMessage[],
  options?: GenerateOptions,
): Promise<AnonymizedPayload> {
  // Language + sensitive-topic gates run FIRST so batch prefetch skips
  // blocked threads without paying any pipeline cost.
  assertSupportedLanguage(messages);
  assertNoSensitiveTopics(messages);

  // NER is optional — mirror anonymizingCloudProvider.generate behavior.
  // Caller is responsible for holding the AI resource lock IF the NER
  // model is installed. In the batch path in `features/ai/api.ts`, this
  // function is called inside an `acquireAI()` scope when NER is ready,
  // or outside it when running regex-only.
  const useNer = isNerModelReady();

  let result: AnonymizedPayload;
  try {
    result = await anonymizeMessages(messages, {
      signal: options?.signal,
      ctx: options?.ctx,
      ...(useNer ? { runNerInference } : {}),
    });
  } catch (err) {
    if (err instanceof NerModelNotInstalledError) {
      // Race — fall back to regex-only
      result = await anonymizeMessages(messages, {
        signal: options?.signal,
        ctx: options?.ctx,
      });
    } else {
      throw err;
    }
  }

  assertNoLeaks(result.anonMessages);
  return result;
}

/**
 * Phase 2 of a batched cloud call: send a payload that was already
 * anonymized by `anonymizePayloadForCloud` to the cloud provider and
 * de-anonymize the response using the shared map.
 *
 * Does not acquire any locks — the caller is expected to coordinate
 * network-phase locking if needed (typically not, since cloud fetches
 * don't participate in the AI/network serialization).
 */
export async function cloudSendAnonymized(
  payload: AnonymizedPayload,
  options?: GenerateOptions,
): Promise<string> {
  const response = await cloudProvider.generate(payload.anonMessages, options);
  return deAnonymize(response, payload.map);
}
