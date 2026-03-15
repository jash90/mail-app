export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: 'cloud' | 'local';
  generate(messages: ChatMessage[]): Promise<string>;
}

export interface EmailContext {
  from?: { email: string; name: string } | null;
  user?: { givenName?: string; familyName?: string } | null;
}

export function formatContext(
  ctx: EmailContext,
  labels: { recipient: string; sender: string } = { recipient: 'Recipient', sender: 'Sender' },
): string {
  const lines: string[] = [];
  if (ctx.from?.name || ctx.from?.email) {
    lines.push(`${labels.recipient}: ${ctx.from.name || ''} <${ctx.from.email}>`);
  }
  if (ctx.user?.givenName || ctx.user?.familyName) {
    lines.push(
      `${labels.sender}: ${ctx.user.givenName ?? ''} ${ctx.user.familyName ?? ''}`,
    );
  }
  return lines.join('\n');
}
