export interface TTSModel {
  lang: string;
  modelName: string;
  onnxFile: string;
  url: string;
}

export const TTS_MODELS: Record<string, TTSModel> = {
  pl: {
    lang: 'pl',
    modelName: 'vits-piper-pl_PL-darkman-medium',
    onnxFile: 'pl_PL-darkman-medium.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pl_PL-darkman-medium.tar.bz2',
  },
  en: {
    lang: 'en',
    modelName: 'vits-piper-en_US-ryan-medium',
    onnxFile: 'en_US-ryan-medium.onnx',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-medium.tar.bz2',
  },
};

export const DEFAULT_LANG = 'en';
