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

const PL_DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

export function detectLang(text: string): string {
  if (text.length < 20) return DEFAULT_LANG;

  const results = francAll(text, { minLength: 20 });
  const top = results[0];
  if (!top || top[0] === 'und') return DEFAULT_LANG;

  let detected = top[0];

  // Polish diacritics are unique — if present and pol ranks in top 3, prefer it
  if (detected !== 'pol' && PL_DIACRITICS.test(text)) {
    const polRank = results.findIndex((r) => r[0] === 'pol');
    if (polRank !== -1 && polRank < 3) {
      detected = 'pol';
    }
  }

  const lang1 = ISO3_TO_1[detected] ?? DEFAULT_LANG;
  const finalLang = lang1 in TTS_MODELS ? lang1 : DEFAULT_LANG;

  return finalLang;
}
