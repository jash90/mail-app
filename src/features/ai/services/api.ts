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

export const getSummaryCache = getCache;
export const getSummaryCacheBatch = getCacheBatch;
const setSummaryCache = setCache;

export async function summarizeEmail(
  threadId: string,
  subject: string,
  snippet: string,
  signal?: AbortSignal,
): Promise<string> {
  const cached = getSummaryCache(threadId);
  if (cached) return cached;

  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    snippet ? `Content: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Summarize the email in max 500 characters. If the email is in Polish, summarize in Polish. Otherwise summarize in English. Be concise and informative.',
    },
    { role: 'user', content: userMsg },
  ];

  const summary = await getProvider().generate(messages, signal, 'summary');

  setSummaryCache(threadId, summary);
  return summary;
}

export async function prefetchSummaries(
  accountId: string,
  signal?: AbortSignal,
  userEmail?: string,
): Promise<void> {
  if (!userEmail) return;

  const threads = selectThreadsForSummary(accountId, userEmail, 20);
  const isLocal = getActiveProviderName() === 'local';

  let releaseAILock: (() => void) | null = null;
  if (isLocal) {
    releaseAILock = await acquireAI(signal);
  }

  try {
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
        )
          return;
        console.warn(
          `[prefetchSummaries] Failed thread ${t.id}:`,
          err instanceof Error ? err.message : err,
        );
        consecutiveFailures++;
        if (consecutiveFailures >= 3) return;
      }
    }
  } finally {
    releaseAILock?.();
    if (isLocal) {
      releaseLocalProvider().catch(() => {});
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
    signal,
    'compose',
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
    signal,
    'reply',
  );
}
