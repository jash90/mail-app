import type { ChatMessage } from '../types';

export function buildSummaryMessages(
  subject: string,
  snippet: string,
): ChatMessage[] {
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    snippet ? `Content: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'Summarize the email in 3 bullet points. Match the language of the email. Be concise.',
    },
    { role: 'user', content: userMsg },
  ];
}

const LOCAL_SYSTEM_PROMPT = `You are an email assistant. Write professional, concise emails.
- Match the language of the user's input
- Only write the email body, no subject
- Keep it short and professional`;

interface EmailContext {
  from?: { email: string; name: string } | null;
  user?: { givenName?: string; familyName?: string } | null;
}

function formatContext(ctx: EmailContext): string {
  const lines: string[] = [];
  if (ctx.from?.name || ctx.from?.email) {
    lines.push(`To: ${ctx.from.name || ''} <${ctx.from.email}>`);
  }
  if (ctx.user?.givenName || ctx.user?.familyName) {
    lines.push(
      `From: ${ctx.user.givenName ?? ''} ${ctx.user.familyName ?? ''}`,
    );
  }
  return lines.join('\n');
}

export function buildEmailMessages(
  prompt: string,
  subject: string,
  from: EmailContext['from'],
  user: EmailContext['user'],
): ChatMessage[] {
  const context = formatContext({ from, user });
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    context,
    `Write an email about: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system', content: LOCAL_SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];
}

export function buildReplyMessages(
  originalBody: string,
  userHint: string,
  subject: string,
  from: EmailContext['from'],
  user: EmailContext['user'],
): ChatMessage[] {
  const context = formatContext({ from, user });
  const userMsg = [
    subject ? `Subject: ${subject}` : '',
    context,
    `Original message:\n${originalBody}`,
    userHint
      ? `Instructions: ${userHint}`
      : 'Write a professional reply to the message above.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system', content: LOCAL_SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];
}
