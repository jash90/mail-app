import { selectThreadsForSummary } from '@/src/shared/db/repositories/threads';
import {
  getSummaryCache as getCache,
  getSummaryCacheBatch as getCacheBatch,
  setSummaryCache as setCache,
} from '@/src/shared/db/repositories/summaryCache';
import {
  getProvider,
  getActiveProviderName,
  releaseLocalProvider,
} from '../providers';
import {
  anonymizePayloadForCloud,
  cloudSendAnonymized,
} from '../providers/anonymizingCloud';
import { isNerModelReady } from '../anonymization/nerContext';
import { acquireAI } from '@/src/shared/services/resourceLock';
import type { ChatMessage, EmailContext } from '../types';
import { formatContext } from '../types';

export {
  getProvider,
  getActiveProviderName,
  releaseLocalProvider,
} from '../providers';

const SYSTEM_PROMPT = `You are an AI email assistant. Write professional, concise emails.
- Match the language of the user's input (if they write in Polish, respond in Polish)
- Keep the tone appropriate for business communication
- Do not include subject lines — only the email body
- Do not wrap in quotes or add metadata
- Format the email with proper structure: greeting, body paragraphs, closing, and signature
- Use line breaks between sections for readability
- Keep paragraphs short (2-3 sentences max)`;

const SUMMARY_SYSTEM_PROMPT =
  'Summarize the email in max 500 characters. If the email is in Polish, summarize in Polish. Otherwise summarize in English. Be concise and informative.';

export const getSummaryCache = getCache;
export const getSummaryCacheBatch = getCacheBatch;
const setSummaryCache = setCache;

function buildSummaryMessages(subject: string, snippet: string): ChatMessage[] {
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    snippet ? `Content: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];
}

export async function summarizeEmail(
  threadId: string,
  subject: string,
  snippet: string,
  signal?: AbortSignal,
): Promise<string> {
  const cached = getSummaryCache(threadId);
  if (cached) return cached;

  const summary = await getProvider().generate(
    buildSummaryMessages(subject, snippet),
    { signal, operation: 'summary' },
  );

  setSummaryCache(threadId, summary);
  return summary;
}

interface SummaryThread {
  id: string;
  subject: string;
  snippet: string;
}

/**
 * Prefetch summaries for the latest N threads.
 *
 * Three code paths depending on provider and NER model availability:
 *
 *   - **Local provider**: one `acquireAI` hold across all N summarizations
 *     (llama.rn chat model stays loaded).
 *
 *   - **Cloud provider + NER model installed**: two-phase batch.
 *     Phase 1 holds the AI lock, anonymizes all N payloads under a single
 *     NER model load. Phase 2 releases the AI lock and fires the cloud
 *     calls with pre-anonymized payloads, then caches the de-anonymized
 *     summaries. Amortizes the NER cold start over the whole batch.
 *
 *   - **Cloud provider + NER model missing**: fall through to per-thread
 *     `summarizeEmail`, which surfaces `ANONYMIZATION_MODEL_MISSING` via
 *     the existing failure counter.
 */
export async function prefetchSummaries(
  accountId: string,
  signal?: AbortSignal,
  userEmail?: string,
): Promise<void> {
  if (!userEmail) return;

  const threads = selectThreadsForSummary(accountId, userEmail, 20);
  if (threads.length === 0) return;

  if (getActiveProviderName() === 'local') {
    return prefetchLocalBatch(threads, signal);
  }

  if (isNerModelReady()) {
    return prefetchCloudAnonymizedBatch(threads, signal);
  }

  // Cloud selected but NER model is missing — per-thread fallback so the
  // first failure short-circuits cleanly via the existing retry counter.
  return prefetchSequential(threads, signal);
}

async function prefetchLocalBatch(
  threads: SummaryThread[],
  signal?: AbortSignal,
): Promise<void> {
  const releaseAILock = await acquireAI(signal);
  try {
    await prefetchSequential(threads, signal);
  } finally {
    releaseAILock();
    releaseLocalProvider().catch(() => {});
  }
}

async function prefetchSequential(
  threads: SummaryThread[],
  signal?: AbortSignal,
): Promise<void> {
  let consecutiveFailures = 0;
  for (const t of threads) {
    if (signal?.aborted) return;
    try {
      await summarizeEmail(t.id, t.subject, t.snippet, signal);
      consecutiveFailures = 0;
    } catch (err) {
      if (
        signal?.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      console.warn(
        `[prefetchSummaries] Failed thread ${t.id}:`,
        err instanceof Error ? err.message : err,
      );
      consecutiveFailures++;
      if (consecutiveFailures >= 3) return;
    }
  }
}

/**
 * Two-phase cloud batch prefetch. Phase 1 anonymizes all payloads under
 * the AI lock (one NER model load for the whole batch). Phase 2 fires
 * cloud calls with the pre-anonymized payloads.
 */
async function prefetchCloudAnonymizedBatch(
  threads: SummaryThread[],
  signal?: AbortSignal,
): Promise<void> {
  interface PendingCall {
    threadId: string;
    anonMessages: ChatMessage[];
    map: import('../anonymization').PlaceholderMap;
  }

  const toProcess = threads.filter((t) => !getSummaryCache(t.id));
  if (toProcess.length === 0) return;

  // Phase 1: anonymize all pending threads under the AI lock.
  const releaseAI = await acquireAI(signal);
  const pending: PendingCall[] = [];
  try {
    for (const t of toProcess) {
      if (signal?.aborted) return;
      const messages = buildSummaryMessages(t.subject, t.snippet);
      try {
        const payload = await anonymizePayloadForCloud(messages, {
          signal,
          operation: 'summary',
        });
        pending.push({
          threadId: t.id,
          anonMessages: payload.anonMessages,
          map: payload.map,
        });
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        console.warn(
          `[prefetchSummaries] anonymize failed for ${t.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } finally {
    releaseAI();
  }

  // Phase 2: cloud calls with pre-anonymized payloads.
  let consecutiveFailures = 0;
  for (const call of pending) {
    if (signal?.aborted) return;
    try {
      const summary = await cloudSendAnonymized(
        { anonMessages: call.anonMessages, map: call.map },
        { signal, operation: 'summary' },
      );
      setSummaryCache(call.threadId, summary);
      consecutiveFailures = 0;
    } catch (err) {
      if (
        signal?.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      console.warn(
        `[prefetchSummaries] cloud call failed for ${call.threadId}:`,
        err instanceof Error ? err.message : err,
      );
      consecutiveFailures++;
      if (consecutiveFailures >= 3) return;
    }
  }
}

export async function generateEmail(
  prompt: string,
  subject = '',
  from: EmailContext['from'],
  user: EmailContext['user'],
  signal?: AbortSignal,
): Promise<string> {
  const context = formatContext({ from, user });
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    context,
    `Write an email about: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return getProvider().generate(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    { signal, operation: 'compose', ctx: { from, user } },
  );
}

export async function generateReply(
  originalBody: string,
  userHint: string,
  subject = '',
  from: EmailContext['from'],
  user: EmailContext['user'],
  signal?: AbortSignal,
): Promise<string> {
  const context = formatContext({ from, user });
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    context,
    `Original message:\n${originalBody}`,
    userHint
      ? `User's draft/instructions: ${userHint}`
      : 'Write a professional reply to the message above.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return getProvider().generate(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    { signal, operation: 'reply', ctx: { from, user } },
  );
}
