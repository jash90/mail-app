import { db } from '@/db/client';
import { getUnreadThreads } from '@/db/repositories/threads';
import { summaryCache } from '@/db/schema';
import { GoogleUser } from '@/store/authStore';
import { and, eq, gt } from 'drizzle-orm';

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';
if (__DEV__ && !ZAI_API_KEY) {
  console.warn('[AI] EXPO_PUBLIC_ZAI_API_KEY is not set — AI features will fail');
}
const ZAI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZaiResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export async function chatCompletion(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  // Link external signal to internal controller
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-5',
        messages,
        temperature: 0.7,
        max_tokens: 16384,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Z.AI API error: ${response.status}`);
    }

    const data: ZaiResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Z.AI returned empty response');
    return content;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

const SYSTEM_PROMPT = `You are an AI email assistant. Write professional, concise emails.
- Match the language of the user's input (if they write in Polish, respond in Polish)
- Keep the tone appropriate for business communication
- Do not include subject lines — only the email body
- Do not wrap in quotes or add metadata
- Format the email with proper structure: greeting, body paragraphs, closing, and signature
- Use line breaks between sections for readability
- Keep paragraphs short (2-3 sentences max)`; 


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
  const now = new Date().toISOString();
  db.insert(summaryCache)
    .values({ key, summary, createdAt: now })
    .onConflictDoUpdate({
      target: summaryCache.key,
      set: { summary, createdAt: now },
    })
    .run();
}

export async function summarizeEmail(threadId: string, subject: string, snippet: string, signal?: AbortSignal): Promise<string> {
  const cached = getSummaryCache(threadId);
  if (cached) return cached;

  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    snippet ? `Content: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const summary = await chatCompletion([
    {
      role: 'system',
      content:
        'Summarize the email in 5 sentences. Match the language of the email content. Be concise and informative.',
    },
    { role: 'user', content: userMsg },
  ], signal);

  setSummaryCache(threadId, summary);
  return summary;
}

export async function prefetchSummaries(accountId: string, signal?: AbortSignal): Promise<void> {
  const threads = getUnreadThreads(accountId, 20);
  let consecutiveFailures = 0;

  for (const t of threads) {
    if (signal?.aborted) return;
    const cached = getSummaryCache(t.id);
    if (cached) continue;
    try {
      await summarizeEmail(t.id, t.subject, t.snippet, signal);
      consecutiveFailures = 0;
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      console.warn(`[prefetchSummaries] Failed thread ${t.id}:`, err instanceof Error ? err.message : err);
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

  return chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ], signal);
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

  return chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ], signal);
}
