import type { ChatMessage, EmailContext } from '../types';
import { formatContext } from '../types';

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

const contextLabels = { recipient: 'To', sender: 'From' };

export function buildEmailMessages(
  prompt: string,
  subject: string,
  from: EmailContext['from'],
  user: EmailContext['user'],
): ChatMessage[] {
  const context = formatContext({ from, user }, contextLabels);
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
  const context = formatContext({ from, user }, contextLabels);
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
