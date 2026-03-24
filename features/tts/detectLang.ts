import { francAll } from 'franc-min';
import { TTS_MODELS, DEFAULT_LANG } from './models';

const ISO3_TO_1: Record<string, string> = {
  pol: 'pl',
  eng: 'en',
  deu: 'de',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  nld: 'nl',
  rus: 'ru',
  ukr: 'uk',
  ces: 'cs',
  slk: 'sk',
};

export function detectLang(text: string): string {
  if (text.length < 20) return DEFAULT_LANG;

  const results = francAll(text, { minLength: 20 });
  const top = results[0];
  if (!top || top[0] === 'und') return DEFAULT_LANG;

  const lang1 = ISO3_TO_1[top[0]] ?? DEFAULT_LANG;

  // Only return lang if we have a TTS model for it, otherwise fallback
  return lang1 in TTS_MODELS ? lang1 : DEFAULT_LANG;
}
