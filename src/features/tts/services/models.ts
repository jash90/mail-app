import RNFS from 'react-native-fs';

export interface TTSModel {
  lang: string;
  modelName: string;
  onnxFile: string;
  url: string;
}

export const TTS_MODELS: Record<string, TTSModel> = {
  pl: {
    lang: 'pl',
    modelName: 'vits-piper-pl_PL-meski_wg_glos-medium',
    onnxFile: 'pl_PL-meski_wg_glos-medium.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pl_PL-meski_wg_glos-medium.tar.bz2',
  },
  en: {
    lang: 'en',
    modelName: 'vits-piper-en_US-ryan-medium',
    onnxFile: 'en_US-ryan-medium.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-medium.tar.bz2',
  },
};

export const DEFAULT_LANG = 'en';

// --- Polish voice alternatives (DEV only) ---

export type VoiceGender = 'male' | 'female';

export interface PolishVoice {
  id: string;
  label: string;
  gender: VoiceGender;
  size: string;
  modelName: string;
  onnxFile: string;
  url: string;
}

const BASE_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';

export const POLISH_VOICES: PolishVoice[] = [
  {
    id: 'meski',
    label: 'Męski',
    gender: 'male',
    size: '~64 MB',
    modelName: 'vits-piper-pl_PL-meski_wg_glos-medium',
    onnxFile: 'pl_PL-meski_wg_glos-medium.onnx',
    url: `${BASE_URL}/vits-piper-pl_PL-meski_wg_glos-medium.tar.bz2`,
  },
];

export function getPolishVoiceById(id: string): PolishVoice | undefined {
  return POLISH_VOICES.find((v) => v.id === id);
}

export function polishVoiceToTTSModel(voice: PolishVoice): TTSModel {
  return {
    lang: 'pl',
    modelName: voice.modelName,
    onnxFile: voice.onnxFile,
    url: voice.url,
  };
}

const MODEL_BASE_DIR = `${RNFS.DocumentDirectoryPath}/tts-model`;

export function getModelFilePath(modelName: string, onnxFile: string): string {
  return `${MODEL_BASE_DIR}/${modelName}/${onnxFile}`;
}
