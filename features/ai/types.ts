import { LLAMA3_2_1B, LLAMA3_2_3B, QWEN3_4B } from 'react-native-executorch';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: 'cloud' | 'local';
  generate(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
}

export interface LLMModelSource {
  modelSource: string;
  tokenizerSource: string;
  tokenizerConfigSource?: string;
}

export interface LocalModel {
  id: string;
  label: string;
  modelSource: LLMModelSource;
  sizeMB: number;
  parameterSize: '1b' | '1.5b' | '3b' | '4b' | '4.5b';
}

const HF_BIELIK_BASE =
  'https://huggingface.co/software-mansion/react-native-executorch-bielik-v3.0/resolve/main';

const BIELIK_V3_1_5B: LLMModelSource = {
  modelSource: `${HF_BIELIK_BASE}/bielik-v3.0-1.5B/quantized/bielik-1.5b-v3-instruct-8da4w.pte`,
  tokenizerSource: `${HF_BIELIK_BASE}/tokenizer.json`,
  tokenizerConfigSource: `${HF_BIELIK_BASE}/tokenizer_config.json`,
};

const HF_BIELIK_4_5B_BASE =
  'https://huggingface.co/jash90/Bielik-4.5B-v3.0-Instruct-ExecuTorch/resolve/main';

const BIELIK_V3_4_5B: LLMModelSource = {
  modelSource: `${HF_BIELIK_4_5B_BASE}/bielik-4.5b-v3-instruct-8da4w.pte`,
  tokenizerSource: `${HF_BIELIK_4_5B_BASE}/tokenizer.json`,
  tokenizerConfigSource: `${HF_BIELIK_4_5B_BASE}/tokenizer_config.json`,
};

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'bielik-4.5b',
    label: 'Bielik 4.5B v3.0 (PL)',
    modelSource: BIELIK_V3_4_5B,
    sizeMB: 2700,
    parameterSize: '4.5b',
  },
  {
    id: 'bielik-1.5b',
    label: 'Bielik 1.5B v3.0 (PL)',
    modelSource: BIELIK_V3_1_5B,
    sizeMB: 1650,
    parameterSize: '1.5b',
  },
  {
    id: 'llama3.2-1b',
    label: 'Llama 3.2 1B (Meta)',
    modelSource: LLAMA3_2_1B as LLMModelSource,
    sizeMB: 700,
    parameterSize: '1b',
  },
  {
    id: 'llama3.2-3b',
    label: 'Llama 3.2 3B (Meta)',
    modelSource: LLAMA3_2_3B as LLMModelSource,
    sizeMB: 1800,
    parameterSize: '3b',
  },
  {
    id: 'qwen3-4b',
    label: 'Qwen 3 4B (Alibaba)',
    modelSource: QWEN3_4B as LLMModelSource,
    sizeMB: 2400,
    parameterSize: '4b',
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

export function isSmallModel(modelId: string): boolean {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  return model ? ['1b', '1.5b'].includes(model.parameterSize) : false;
}

export function isQwen3Model(modelId: string): boolean {
  return modelId.startsWith('qwen3');
}
