import {
  detectSensitiveTopics,
  detectSensitiveCategories,
  type SensitiveCategory,
} from '@/src/features/ai/anonymization/sensitiveTopics';

describe('detectSensitiveTopics', () => {
  it('returns empty for empty input', () => {
    expect(detectSensitiveTopics('')).toEqual([]);
    expect(detectSensitiveTopics('   ')).toEqual([]);
  });

  it('returns empty for neutral business text', () => {
    const neutral = [
      'Hi team, quick update on the Q3 strategy meeting.',
      'Please review the attached report and let me know if you have',
      'bandwidth for a follow-up next week. Thanks!',
    ].join('\n');
    expect(detectSensitiveTopics(neutral)).toEqual([]);
  });

  it('detects Polish health keyword (choroba)', () => {
    const matches = detectSensitiveTopics('Mam chorobę przewlekłą.');
    expect(matches.map((m) => m.category)).toContain('health');
  });

  it('detects Polish cukrzyca in a sentence', () => {
    const matches = detectSensitiveTopics('Pacjent ma cukrzycę typu drugiego.');
    expect(matches.map((m) => m.category)).toContain('health');
  });

  it('detects English health keyword (diabetes)', () => {
    const matches = detectSensitiveTopics('The patient has diabetes.');
    expect(matches.map((m) => m.category)).toContain('health');
  });

  it('detects HIV and AIDS as acronyms', () => {
    expect(
      detectSensitiveTopics('Test HIV result was negative.').some(
        (m) => m.category === 'health',
      ),
    ).toBe(true);
    expect(
      detectSensitiveTopics('aids research paper').some(
        (m) => m.category === 'health',
      ),
    ).toBe(true);
  });

  it('detects religion keywords in Polish and English', () => {
    expect(detectSensitiveCategories('Idę do kościoła w niedzielę.')).toContain(
      'religion',
    );
    expect(
      detectSensitiveCategories('The church service starts at 10.'),
    ).toContain('religion');
  });

  it('detects sexual orientation keywords', () => {
    expect(
      detectSensitiveCategories('He came out as gay last year.'),
    ).toContain('sexual_orientation');
    expect(detectSensitiveCategories('organizacja LGBT w Warszawie')).toContain(
      'sexual_orientation',
    );
  });

  it('detects political opinion keywords', () => {
    expect(
      detectSensitiveCategories('Wyniki wyborów były zaskakujące.'),
    ).toContain('political_opinion');
    expect(
      detectSensitiveCategories('voting results came in last night'),
    ).toContain('political_opinion');
  });

  it('detects biometric keywords', () => {
    expect(detectSensitiveCategories('DNA test results attached.')).toContain(
      'biometric',
    );
    expect(detectSensitiveCategories('odcisk palca nie pasuje')).toContain(
      'biometric',
    );
  });

  it('detects trade union keywords', () => {
    expect(
      detectSensitiveCategories('Strajk związkowy zaplanowany na piątek.'),
    ).toContain('trade_union');
    expect(detectSensitiveCategories('trade union meeting tomorrow')).toContain(
      'trade_union',
    );
  });

  it('🟡 Art. 10 — detects criminal conviction keywords (PL)', () => {
    expect(
      detectSensitiveCategories('Otrzymał wyrok 5 lat pozbawienia wolności.'),
    ).toContain('criminal_record');
    expect(detectSensitiveCategories('Został skazany w 2023')).toContain(
      'criminal_record',
    );
    expect(
      detectSensitiveCategories('Popełnił przestępstwo kradzieży'),
    ).toContain('criminal_record');
    expect(
      detectSensitiveCategories('areszt tymczasowy do wyjaśnienia'),
    ).toContain('criminal_record');
  });

  it('🟡 Art. 10 — detects criminal conviction keywords (EN)', () => {
    expect(
      detectSensitiveCategories('She has a prior felony conviction'),
    ).toContain('criminal_record');
    expect(
      detectSensitiveCategories('released on parole last month'),
    ).toContain('criminal_record');
    expect(detectSensitiveCategories('arrest record from 2019')).toContain(
      'criminal_record',
    );
  });

  it('🟡 Art. 10 — neutral "sentence" (linguistic) is a known false positive', () => {
    // The word "sentence" in a grammatical/linguistic sense will trigger
    // the gate. This is an accepted trade-off: safer to over-block than
    // leak actual criminal record data. Documented here so anyone
    // debugging a false-positive report knows why.
    expect(
      detectSensitiveCategories('Please rewrite this sentence more clearly'),
    ).toContain('criminal_record');
  });

  it('does not match keyword inside a longer word (cat in cataract)', () => {
    // "rak" should not match inside "rakieta" (rocket)
    const matches = detectSensitiveTopics('Nowa rakieta startuje o 10.');
    expect(matches.map((m) => m.category)).not.toContain('health');
  });

  it('does not match Polish "PO" as a political party (common preposition)', () => {
    // We excluded PO from the keyword list because it collides with the
    // common Polish preposition "po" ("after"). This test guards against
    // anyone re-adding it without thinking through the FP impact.
    const matches = detectSensitiveTopics('Spotkamy się po obiedzie.');
    expect(matches.map((m) => m.category)).not.toContain('political_opinion');
  });

  it('is case-insensitive', () => {
    expect(
      detectSensitiveTopics('DIABETES is a serious condition.').some(
        (m) => m.category === 'health',
      ),
    ).toBe(true);
    expect(
      detectSensitiveTopics('Diabetes is a serious condition.').some(
        (m) => m.category === 'health',
      ),
    ).toBe(true);
  });

  it('detects multiple categories in one text', () => {
    const mixed = 'Pacjent ma cukrzycę i chodzi do kościoła regularnie.';
    const categories = detectSensitiveCategories(mixed);
    expect(categories).toContain('health');
    expect(categories).toContain('religion');
  });

  it('matches multi-word phrases (partia polityczna)', () => {
    expect(
      detectSensitiveCategories('Nowa partia polityczna powstała w maju.'),
    ).toContain('political_opinion');
    expect(
      detectSensitiveCategories('political party fundraising event'),
    ).toContain('political_opinion');
  });
});

describe('detectSensitiveCategories', () => {
  it('deduplicates categories', () => {
    const matches = detectSensitiveCategories(
      'diabetes and cancer are both diseases',
    );
    const healthCount = matches.filter(
      (c: SensitiveCategory) => c === 'health',
    ).length;
    expect(healthCount).toBe(1);
  });

  it('returns empty for neutral input', () => {
    expect(detectSensitiveCategories('Hello, how are you?')).toEqual([]);
  });
});
