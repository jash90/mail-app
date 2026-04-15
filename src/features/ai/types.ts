export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: 'cloud' | 'local';
  generate(
    messages: ChatMessage[],
    signal?: AbortSignal,
    operation?: import('./services/tokenTracker').AiOperation,
  ): Promise<string>;
}

export interface LocalModel {
  id: string;
  label: string;
  filename: string;
  url: string;
  sizeMB: number;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'llama3.2-3b',
    label: 'Llama 3.2 3B (Meta)',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeMB: 2020,
  },
  {
    id: 'bielik-4.5b',
    label: 'Bielik 4.5B v3.0 (PL)',
    filename: 'Bielik-4.5B-v3.0-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/second-state/Bielik-4.5B-v3.0-Instruct-GGUF/resolve/main/Bielik-4.5B-v3.0-Instruct-Q4_K_M.gguf',
    sizeMB: 2900,
  },
  {
    id: 'qwen3-4b',
    label: 'Qwen 3 4B (Alibaba)',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    sizeMB: 2500,
  },
];

export interface EmailContext {
  from?: { email: string; name: string } | null;
  user?: { givenName?: string; familyName?: string } | null;
}

export function formatContext(
  ctx: EmailContext,
  labels: { recipient: string; sender: string } = {
    recipient: 'Odbiorca',
    sender: 'Nadawca',
  },
): string {
  const lines: string[] = [];
  if (ctx.from?.name || ctx.from?.email) {
    lines.push(
      `${labels.recipient}: ${ctx.from.name || ''} <${ctx.from.email}>`,
    );
  }
  if (ctx.user?.givenName || ctx.user?.familyName) {
    lines.push(
      `${labels.sender}: ${ctx.user.givenName ?? ''} ${ctx.user.familyName ?? ''}`,
    );
  }
  return lines.join('\n');
}
