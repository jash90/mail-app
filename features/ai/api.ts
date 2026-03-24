import { db } from '@/db/client';
import { getUnreadThreads } from '@/db/repositories/threads';
import { summaryCache } from '@/db/schema';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { getProvider } from './providers';
import type { ChatMessage, EmailContext } from './types';
import { formatContext } from './types';

export { chatCompletion } from './cloud-api';

const SYSTEM_PROMPT = `You are an AI email assistant. Write professional, concise emails.
- Match the language of the user's input (if they write in Polish, respond in Polish)
- Keep the tone appropriate for business communication
- Do not include subject lines — only the email body
- Do not wrap in quotes or add metadata
- Format the email with proper structure: greeting, body paragraphs, closing, and signature
- Use line breaks between sections for readability
- Keep paragraphs short (2-3 sentences max)`;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getSummaryCache(key: string): string | null {
  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const row = db
    .select({ summary: summaryCache.summary })
    .from(summaryCache)
    .where(and(eq(summaryCache.key, key), gt(summaryCache.createdAt, cutoff)))
    .get();
  return row?.summary ?? null;
}

export function getSummaryCacheBatch(keys: string[]): Map<string, string> {
  if (!keys.length) return new Map();
  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const rows = db
    .select({ key: summaryCache.key, summary: summaryCache.summary })
    .from(summaryCache)
    .where(
      and(inArray(summaryCache.key, keys), gt(summaryCache.createdAt, cutoff)),
    )
    .all();
  return new Map(rows.map((r) => [r.key, r.summary]));
}

function setSummaryCache(key: string, summary: string): void {
  const now = new Date().toISOString();
  db.insert(summaryCache)
    .values({ key, summary, createdAt: now })
    .onConflictDoUpdate({
      target: summaryCache.key,
      set: { summary, createdAt: now },
    })
    .run();
}

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

  const summary = await getProvider().generate(messages, signal);

  setSummaryCache(threadId, summary);
  return summary;
}

export async function prefetchSummaries(
  accountId: string,
  signal?: AbortSignal,
): Promise<void> {
  const threads = getUnreadThreads(accountId, 20);
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
  );
}
