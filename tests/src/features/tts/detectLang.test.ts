import { detectLang } from '@/src/features/tts/services/detectLang';

// Mock franc-min — simulate language detection
jest.mock('franc-min', () => ({
  francAll: jest.fn((text: string) => {
    // Simple heuristic for test: check for Polish diacritics
    const hasPl = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text);
    if (hasPl) {
      return [
        ['pol', 0.95],
        ['ces', 0.7],
        ['slk', 0.5],
      ];
    }
    // Default: English
    return [
      ['eng', 0.9],
      ['deu', 0.3],
      ['fra', 0.2],
    ];
  }),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe('detectLang', () => {
  it('detects English text', () => {
    const result = detectLang(
      'This is a sample email about the project meeting next week',
    );
    expect(result).toBe('en');
  });

  it('detects Polish text with diacritics', () => {
    const result = detectLang(
      'Dzień dobry, chciałbym zapytać o szczegóły spotkania w przyszłym tygodniu',
    );
    expect(result).toBe('pl');
  });

  it('returns default language for short text (< 20 chars)', () => {
    const result = detectLang('Hello world');
    // DEFAULT_LANG is 'en'
    expect(result).toBe('en');
  });

  it('returns default language for empty string', () => {
    const result = detectLang('');
    expect(result).toBe('en');
  });

  it('returns default language for very short Polish', () => {
    const result = detectLang('Cześć');
    expect(result).toBe('en'); // Too short → default
  });

  it('prefers Polish when diacritics present and pol ranks in top 3', () => {
    const { francAll } = require('franc-min');
    // Simulate: top result is Czech but Polish is #2
    francAll.mockReturnValueOnce([
      ['ces', 0.85],
      ['pol', 0.8],
      ['slk', 0.6],
    ]);

    const result = detectLang(
      'Proszę o przesłanie dokumentów dotyczących współpracy',
    );
    expect(result).toBe('pl');
  });

  it('falls back to default for unsupported language', () => {
    const { francAll } = require('franc-min');
    francAll.mockReturnValueOnce([
      ['jpn', 0.95],
      ['zho', 0.7],
    ]);

    const result = detectLang(
      'This is a long enough text for language detection to work properly',
    );
    // 'jpn' is not in TTS_MODELS → falls back to DEFAULT_LANG
    expect(result).toBe('en');
  });

  it('handles undetermined language (und)', () => {
    const { francAll } = require('franc-min');
    francAll.mockReturnValueOnce([['und', 1.0]]);

    const result = detectLang(
      '12345678901234567890 some numbers and random chars',
    );
    expect(result).toBe('en');
  });
});
