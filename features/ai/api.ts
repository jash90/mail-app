import { GoogleUser } from "@/store/authStore";

const ZAI_API_KEY = process.env.EXPO_PUBLIC_ZAI_API_KEY ?? '';
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

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

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
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Z.AI API error: ${response.status}`);
    }

    const data: ZaiResponse = await response.json();
    return data.choices[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
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

  return chatCompletion([
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

  return chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ]);
}
