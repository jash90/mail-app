import { db } from '@/db/client';
import { getUnreadThreads } from '@/db/repositories/threads';
import { summaryCache } from '@/db/schema';
import { GoogleUser } from '@/store/authStore';
import { and, eq, gt } from 'drizzle-orm';
import type { ChatMessage } from './types';
import { generateWithFallback } from './providers';

interface EmailContext {
  from?: { email: string; name: string } | null;
  user?: GoogleUser | null;
}

function formatContext(ctx: EmailContext): string {
  const lines: string[] = [];
  if (ctx.from?.name || ctx.from?.email) {
    lines.push(`Recipient: ${ctx.from.name || ''} <${ctx.from.email}>`);
  }
  if (ctx.user?.givenName || ctx.user?.familyName) {
    lines.push(`Sender: ${ctx.user.givenName ?? ''} ${ctx.user.familyName ?? ''}`);
  }
  return lines.join('\n');
}

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

function setSummaryCache(key: string, summary: string): void {
  db.insert(summaryCache)
    .values({ key, summary, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: summaryCache.key,
      set: { summary, createdAt: new Date().toISOString() },
    })
    .run();
}

async function generate(messages: ChatMessage[]): Promise<string> {
  return generateWithFallback(messages);
}

export async function summarizeEmail(
  threadId: string,
  subject: string,
  snippet: string,
): Promise<string> {
  const cached = getSummaryCache(threadId);
  if (cached) return cached;

  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    snippet ? `Content: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const summary = await generate([
    {
      role: 'system',
      content:
        'Summarize the email in 5 sentences. Match the language of the email content. Be concise and informative.',
    },
    { role: 'user', content: userMsg },
  ]);

  setSummaryCache(threadId, summary);
  return summary;
}

export async function prefetchSummaries(accountId: string): Promise<void> {
  const threads = getUnreadThreads(accountId, 20);

  for (const t of threads) {
    const cached = getSummaryCache(t.id);
    if (cached) continue;
    try {
      await summarizeEmail(t.id, t.subject, t.snippet);
    } catch {
      // silently skip failed summaries during prefetch
    }
  }
}

export async function generateEmail(
  prompt: string,
  subject = '',
  from: EmailContext['from'],
  user: EmailContext['user'],
): Promise<string> {
  const context = formatContext({ from, user });
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    context,
    `Write an email about: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return generate([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ]);
}

export async function generateReply(
  originalBody: string,
  userHint: string,
  subject = '',
  from: EmailContext['from'],
  user: EmailContext['user'],
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

  return generate([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ]);
}
