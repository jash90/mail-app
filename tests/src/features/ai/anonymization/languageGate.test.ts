// Mock franc-min — pure ESM, Jest can't parse it natively.
// Simulates detection based on common diacritics / keywords.
jest.mock('franc-min', () => ({
  franc: jest.fn((text: string) => {
    if (!text || text.length < 20) return 'und';
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'pol';
    if (/\b(ich|habe|vereinbaren|bitte)\b/i.test(text)) return 'deu';
    if (/\b(bonjour|aide|problème)\b/i.test(text)) return 'fra';
    if (/\b(hola|necesito|problema|médico)\b/i.test(text)) return 'spa';
    if (/\b(the|would|please|meeting|schedule)\b/i.test(text)) return 'eng';
    return 'und';
  }),
}));

import {
  detectLanguage,
  isSupportedLanguage,
} from '@/src/features/ai/anonymization/languageGate';

describe('detectLanguage', () => {
  it('returns "und" for very short text', () => {
    expect(detectLanguage('')).toBe('und');
    expect(detectLanguage('hi')).toBe('und');
  });

  it('detects Polish text', () => {
    const text =
      'Dzień dobry, chciałbym umówić się na spotkanie w przyszłym tygodniu. Proszę o potwierdzenie terminu.';
    expect(detectLanguage(text)).toBe('pol');
  });

  it('detects English text', () => {
    const text =
      'Hello, I would like to schedule a meeting next week. Please confirm the time that works for you.';
    expect(detectLanguage(text)).toBe('eng');
  });

  it('detects German text', () => {
    const text =
      'Guten Tag, ich möchte gerne einen Termin vereinbaren. Bitte bestätigen Sie die Zeit.';
    const lang = detectLanguage(text);
    expect(lang).not.toBe('pol');
    expect(lang).not.toBe('eng');
    expect(lang).not.toBe('und');
  });
});

describe('isSupportedLanguage', () => {
  it('accepts Polish', () => {
    expect(
      isSupportedLanguage(
        'Dzień dobry, chciałbym umówić się na spotkanie w przyszłym tygodniu. Proszę o potwierdzenie terminu.',
      ),
    ).toBe(true);
  });

  it('accepts English', () => {
    expect(
      isSupportedLanguage(
        'Hello, I would like to schedule a meeting next week. Please confirm the time.',
      ),
    ).toBe(true);
  });

  it('accepts undetermined (too short to classify)', () => {
    expect(isSupportedLanguage('hi')).toBe(true);
    expect(isSupportedLanguage('')).toBe(true);
  });

  it('rejects German', () => {
    const text =
      'Guten Tag, ich habe eine schwere Krankheit und brauche sofort Hilfe vom Arzt.';
    expect(isSupportedLanguage(text)).toBe(false);
  });

  it('rejects French', () => {
    const text =
      "Bonjour, j'ai besoin d'aide urgente pour un problème médical très grave qui m'inquiète beaucoup.";
    expect(isSupportedLanguage(text)).toBe(false);
  });

  it('rejects Spanish', () => {
    const text =
      'Hola, necesito ayuda urgente con un problema médico muy grave que me preocupa mucho.';
    expect(isSupportedLanguage(text)).toBe(false);
  });
});
