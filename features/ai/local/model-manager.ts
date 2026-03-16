import {
  QWEN3_0_6B_QUANTIZED,
  QWEN3_1_7B_QUANTIZED,
  QWEN3_4B_QUANTIZED,
  LLAMA3_2_1B_SPINQUANT,
  LLAMA3_2_3B_SPINQUANT,
  LLAMA3_2_3B_QLORA,
  SMOLLM2_1_1_7B_QUANTIZED,
  PHI_4_MINI_4B_QUANTIZED,
  HAMMER2_1_1_5B_QUANTIZED,
  ResourceFetcher,
} from 'react-native-executorch';
import type { LLMProps } from 'react-native-executorch';

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  model: LLMProps['model'];
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'qwen3-0.6b',
    label: 'Qwen3 0.6B',
    description: 'Najszybszy, najmniejszy (~400MB)',
    model: QWEN3_0_6B_QUANTIZED,
  },
  {
    id: 'qwen3-1.7b',
    label: 'Qwen3 1.7B',
    description: 'Dobra jakość, średni rozmiar (~1GB)',
    model: QWEN3_1_7B_QUANTIZED,
  },
  {
    id: 'smollm2-1.7b',
    label: 'SmolLM2 1.7B',
    description: 'Zbalansowany model (~1GB)',
    model: SMOLLM2_1_1_7B_QUANTIZED,
  },
  {
    id: 'llama3.2-1b',
    label: 'Llama 3.2 1B',
    description: 'Meta Llama, spinquant (~800MB)',
    model: LLAMA3_2_1B_SPINQUANT,
  },
  {
    id: 'llama3.2-3b-spinquant',
    label: 'Llama 3.2 3B SpinQuant',
    description: 'Meta Llama 3B, spinquant (~2GB)',
    model: LLAMA3_2_3B_SPINQUANT,
  },
  {
    id: 'llama3.2-3b-qlora',
    label: 'Llama 3.2 3B QLoRA',
    description: 'Meta Llama 3B, QLoRA (~2GB)',
    model: LLAMA3_2_3B_QLORA,
  },
  {
    id: 'qwen3-4b',
    label: 'Qwen3 4B',
    description: 'Duży Qwen, najlepsza jakość (~2.5GB)',
    model: QWEN3_4B_QUANTIZED,
  },
  {
    id: 'phi4-mini-4b',
    label: 'Phi-4 Mini 4B',
    description: 'Microsoft Phi-4, silny reasoning (~2.5GB)',
    model: PHI_4_MINI_4B_QUANTIZED,
  },
  {
    id: 'hammer2.1-1.5b',
    label: 'Hammer 2.1 1.5B',
    description: 'Tool calling model (~1GB)',
    model: HAMMER2_1_1_5B_QUANTIZED,
  },
  {
    id: 'bielik-1.5b',
    label: 'Bielik 1.5B v3.0',
    description: 'Polski model instruct, LlamaForCausalLM (~1.5GB)',
    model: {
      modelSource:
        'https://huggingface.co/jash90/bielik-1.5b-v3.0-instruct-executorch/resolve/main/model.pte',
      tokenizerSource:
        'https://huggingface.co/jash90/bielik-1.5b-v3.0-instruct-executorch/resolve/main/tokenizer.json',
      tokenizerConfigSource:
        'https://huggingface.co/jash90/bielik-1.5b-v3.0-instruct-executorch/resolve/main/tokenizer_config.json',
    },
  },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0]!;

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export async function deleteModelFiles(model: ModelOption): Promise<void> {
  try {
    const sources = [model.model.modelSource, model.model.tokenizerSource];
    if (model.model.tokenizerConfigSource) {
      sources.push(model.model.tokenizerConfigSource);
    }
    await ResourceFetcher.deleteResources(...sources);
  } catch {
    // files may not exist
  }
}
