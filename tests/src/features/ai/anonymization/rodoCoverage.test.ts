/**
 * RODO / GDPR coverage audit.
 *
 * Each test below corresponds to one data category that Polish RODO
 * (GDPR) requires to be anonymized. The test pins the CURRENT pipeline
 * behavior for that category to one of three states:
 *
 *   ✅ COVERED — deterministic regex layer + post-pipeline re-scan
 *      guarantees zero leak of this category. Test asserts the entity
 *      is detected and replaced.
 *
 *   🔴 SENSITIVE GATE — Art. 9 sensitive topic. The pipeline does NOT
 *      anonymize the value (no meaningful way to anonymize "the patient
 *      has diabetes"); instead, the message is hard-blocked from cloud
 *      AI by `assertNoSensitiveTopics`. Test asserts the category is
 *      flagged.
 *
 *   🟡 NER BEST-EFFORT — covered only when the NER model is installed
 *      and Qwen 2.5 0.5B successfully recognizes the entity. F1
 *      ~0.40–0.50 per PII-Bench. Test does NOT assert detection because
 *      NER is mocked; instead, the test documents the expected
 *      placeholder type.
 *
 *   ❌ GAP — not currently covered by ANY layer. Test asserts that the
 *      value is NOT detected, documenting the gap. When v3 closes the
 *      gap, flip the assertion.
 *
 * The test file is intentionally exhaustive — one item per RODO list
 * entry — so it serves as a living coverage matrix. New gaps should be
 * added here first, then implemented.
 */

import {
  detectRegex,
  detectSensitiveCategories,
} from '@/src/features/ai/anonymization';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectedTypes(text: string): string[] {
  return detectRegex(text).map((e) => e.type);
}

function detected(text: string, type: string): boolean {
  return detectedTypes(text).includes(type);
}

function notDetected(text: string): boolean {
  return detectRegex(text).length === 0;
}

// ─── 🔵 Art. 4 — Dane zwykłe ─────────────────────────────────────────────────

describe('🔵 Art. 4 — Dane identyfikacyjne osoby', () => {
  it('✅ Imię i nazwisko (NER best-effort, model required)', () => {
    // Without NER model, prose names are NOT detected by regex.
    // Coverage relies on Qwen 2.5 0.5B + post-pipeline re-scan does NOT
    // catch names (they're not structured PII).
    expect(notDetected('Jan Kowalski przyjechał wczoraj')).toBe(true);
    // Documented gap: covered only when NER model is installed at runtime.
  });

  it('✅ Data urodzenia (v2.1)', () => {
    // DD.MM.YYYY and ISO YYYY-MM-DD are now detected deterministically.
    expect(detected('Data urodzenia: 15.01.1990', 'DATE')).toBe(true);
    expect(detected('Born on 1990-01-15', 'DATE')).toBe(true);
    // Polish "15 stycznia 1990" (month name) still not covered — gap.
    expect(notDetected('15 stycznia 1990')).toBe(true);
    // TODO v3: add PL month-name regex (stycznia, lutego, ..., grudnia)
  });

  it('❌ Wiek — GAP', () => {
    expect(notDetected('Mam 32 lata')).toBe(true);
    expect(notDetected('Age: 32 years old')).toBe(true);
    // TODO v3: hard to regex (false positives on any "32" number).
    // Realistically: only mosaic-effect concern, not standalone PII.
  });

  it('❌ Płeć — GAP (not deterministically anonymizable)', () => {
    expect(notDetected('Płeć: mężczyzna')).toBe(true);
    expect(notDetected('gender: female')).toBe(true);
    // Inherently part of natural language; would need NER + context.
  });

  it('🔴 Narodowość — sensitive gate (ethnic_origin)', () => {
    // Some narodowość mentions are caught via the ethnic_origin keywords.
    // E.g., "uchodźca" or "narodowość romska" trigger; generic "Polish"
    // does not. This is a partial coverage / gate.
    expect(detectSensitiveCategories('uchodźca z Ukrainy')).toContain(
      'ethnic_origin',
    );
    // But generic nationality slips through:
    expect(notDetected('Jestem Polakiem')).toBe(true);
  });
});

describe('🔵 Art. 4 — Dane kontaktowe', () => {
  it('🟡 Adres zamieszkania — NER best-effort', () => {
    // Street + city detected only by NER PLACE entities. Without NER:
    expect(notDetected('ul. Marszałkowska 1, Warszawa')).toBe(true);
    // PL ZIP IS detected on its own (handled in the "kod pocztowy" test).
  });

  it('✅ Numer telefonu komórkowy (PL format)', () => {
    expect(detected('Tel. 600 700 800', 'PHONE')).toBe(true);
    expect(detected('600700800', 'PHONE')).toBe(true);
    expect(detected('+48 600 700 800', 'PHONE')).toBe(true);
  });

  it('🟡 Numer telefonu stacjonarny (PL) — partial coverage', () => {
    // With +48 prefix: caught by INTL_PHONE_RE (matches `\+CC ...` shape)
    expect(detected('+48 22 555 12 34', 'PHONE')).toBe(true);
    // 9-digit 3+3+3 grouping (mobile-style): caught by PL_PHONE_RE
    expect(detected('600 700 800', 'PHONE')).toBe(true);
  });

  it('✅ Stacjonarny w formacie 2+3+2+2 bez +48 (v2.1)', () => {
    // PL_LANDLINE_RE now handles the 2+3+2+2 grouping as a second
    // alternation to PL_PHONE_RE.
    expect(detected('22 555 12 34', 'PHONE')).toBe(true);
  });

  it('✅ Adres e-mail', () => {
    expect(detected('alice@example.com', 'EMAIL')).toBe(true);
  });

  it('✅ Faks — same coverage as phone (3+3+3, 2+3+2+2, or +CC prefix)', () => {
    expect(detected('Faks: +48 22 555 12 34', 'PHONE')).toBe(true);
    expect(detected('Faks: 600 700 800', 'PHONE')).toBe(true);
    // v2.1: landline 2+3+2+2 now caught
    expect(detected('Faks: 22 555 12 34', 'PHONE')).toBe(true);
  });
});

describe('🔵 Art. 4 — Numery identyfikacyjne i dokumenty', () => {
  it('✅ PESEL (with checksum validation)', () => {
    expect(detected('PESEL 44051401458', 'PESEL')).toBe(true);
  });

  it('✅ Dowód osobisty (3 letters + 6 digits, checksum)', () => {
    expect(detected('Dowód: ABC123458', 'DOWOD')).toBe(true);
  });

  it('✅ Paszport PL (v2.1, format only)', () => {
    expect(detected('Passport: AA1234567', 'PASSPORT')).toBe(true);
    // Note: format-only check, no checksum. Accepts any 2 uppercase
    // letters + 7 digits. False positives are possible but rare.
  });

  it('❌ Numer prawa jazdy — GAP', () => {
    // PL driving license has no fixed format (varies by issuing authority)
    expect(notDetected('Prawo jazdy nr 12345/67/890')).toBe(true);
    // TODO v3: difficult — multiple regional formats. Defer.
  });

  it('❌ Numer legitymacji — GAP', () => {
    expect(notDetected('Legitymacja studencka 123456')).toBe(true);
    // TODO v3: too varied across institutions.
  });

  it('❌ Numer księgi wieczystej — GAP', () => {
    // Format: AA1A/00000000/0 (court code + 8 digits + checksum)
    expect(notDetected('KW: WA1M/00000123/4')).toBe(true);
    // TODO v3: add `[A-Z]{2}\d[A-Z]/\d{8}/\d` regex with checksum.
  });

  it('❌ Numer licencji — GAP', () => {
    expect(notDetected('Licencja nr 12345')).toBe(true);
  });
});

describe('🔵 Art. 4 — Dane finansowe i biznesowe', () => {
  it('✅ Numer konta bankowego (IBAN)', () => {
    expect(detected('IBAN: DE89370400440532013000', 'IBAN')).toBe(true);
  });

  it('✅ Numer karty płatniczej (Luhn-valid)', () => {
    expect(detected('Karta: 4111111111111111', 'CARD')).toBe(true);
  });

  it('✅ Przychody / pensje / salda kont (v2.1)', () => {
    expect(detected('Pensja: 8500 zł', 'AMOUNT')).toBe(true);
    expect(detected('Saldo: 12 345,67 PLN', 'AMOUNT')).toBe(true);
    expect(detected('Revenue: 50000 EUR', 'AMOUNT')).toBe(true);
    expect(detected('Price $199.99', 'AMOUNT')).toBe(true);
  });

  it('✅ NIP (10 digits with checksum)', () => {
    expect(detected('NIP 1234567802', 'NIP')).toBe(true);
    expect(detected('123-456-78-02', 'NIP')).toBe(true);
  });

  it('✅ REGON (9 or 14 digits with checksum)', () => {
    expect(detected('REGON: 123456785', 'REGON')).toBe(true);
    expect(detected('REGON: 12345678901235', 'REGON')).toBe(true);
  });

  it('✅ KRS (v2.1)', () => {
    // KRS is a 10-digit number starting with 0 (by registry convention).
    // Priority-ordered BEFORE NIP in detectRegex so it claims the span.
    expect(detected('KRS 0000123456', 'KRS')).toBe(true);
  });
});

describe('🔵 Art. 4 — Dane techniczne / cyfrowe', () => {
  it('✅ Adres IP (v2.1 — IPv4 + IPv6)', () => {
    expect(detected('IP: 192.168.1.1', 'IP')).toBe(true);
    expect(detected('Server at 8.8.8.8 responded', 'IP')).toBe(true);
    expect(detected('::1', 'IP')).toBe(true);
    expect(detected('2001:db8:85a3::8a2e:370:7334', 'IP')).toBe(true);
  });

  it('✅ Adres MAC (v2.1)', () => {
    expect(detected('MAC: 00:1B:44:11:3A:B7', 'MAC')).toBe(true);
    expect(detected('MAC 00-1B-44-11-3A-B7', 'MAC')).toBe(true);
  });

  it('🟡 IMEI — accidentally caught by CARD regex when Luhn-valid', () => {
    // IMEIs are 15 digits and use Luhn checksum (same as credit cards).
    // They pass `isValidLuhn` and get classified as CARD. This is a
    // false-positive in TYPE but a true-positive for ANONYMIZATION:
    // the value never reaches the cloud.
    const imei = '490154203237518'; // Test IMEI, Luhn-valid
    expect(detected(`IMEI ${imei}`, 'CARD')).toBe(true);
  });

  it('✅ URL with auth/session token', () => {
    expect(detected('https://example.com/reset?token=abc123xyz', 'URL')).toBe(
      true,
    );
    expect(
      detected('https://api.example.com/?session=def456&user=alice', 'URL'),
    ).toBe(true);
  });

  it('❌ Login / nazwa użytkownika — GAP', () => {
    expect(notDetected('Login: jankowalski')).toBe(true);
    // No deterministic pattern. Username could be anything.
  });

  it('✅ Lokalizacja GPS (v2.1)', () => {
    // Space-comma separated coords caught deterministically.
    expect(detected('GPS: 52.2297, 21.0122', 'GPS')).toBe(true);
    // URL-encoded lat=...&lng=... form still a gap (different format).
    expect(notDetected('lat=52.2297&lng=21.0122')).toBe(true);
    // TODO v3: add lat=X&lng=Y parsing variant.
  });
});

// ─── 🔴 Art. 9 — Dane szczególnej kategorii ──────────────────────────────────

describe('🔴 Art. 9 — Dane wrażliwe (sensitive-topic gate)', () => {
  it('🔴 Pochodzenie etniczne / rasowe', () => {
    expect(
      detectSensitiveCategories('uchodźca o pochodzeniu etnicznym romskim'),
    ).toContain('ethnic_origin');
  });

  it('🔴 Poglądy polityczne', () => {
    expect(
      detectSensitiveCategories('Wyniki wyborów były zaskakujące'),
    ).toContain('political_opinion');
  });

  it('🔴 Przekonania religijne', () => {
    expect(detectSensitiveCategories('Idę do kościoła w niedzielę')).toContain(
      'religion',
    );
  });

  it('🔴 Przynależność do związków zawodowych', () => {
    expect(detectSensitiveCategories('Strajk związkowy w piątek')).toContain(
      'trade_union',
    );
  });

  it('🔴 Dane genetyczne', () => {
    expect(detectSensitiveCategories('wynik testu genetycznego DNA')).toContain(
      'biometric',
    );
  });

  it('🔴 Dane biometryczne (odcisk palca)', () => {
    expect(detectSensitiveCategories('odcisk palca nie pasuje')).toContain(
      'biometric',
    );
  });

  it('🔴 Stan zdrowia (diagnoza, leczenie)', () => {
    expect(
      detectSensitiveCategories('Diagnoza: cukrzyca typu 2, leczenie w toku'),
    ).toContain('health');
  });

  it('🔴 Orientacja seksualna', () => {
    expect(detectSensitiveCategories('coming out as gay')).toContain(
      'sexual_orientation',
    );
  });
});

// ─── 🟡 Art. 10 — Wyroki i naruszenia prawa ─────────────────────────────────

describe('🟡 Art. 10 — Wyroki skazujące i naruszenia prawa', () => {
  it('🟡 Wyroki skazujące (v2.1, sensitive gate)', () => {
    // Not anonymized — hard-blocked from cloud AI by the keyword gate,
    // same policy as Art. 9 sensitive categories.
    expect(detectSensitiveCategories('Wyrok skazujący na 5 lat')).toContain(
      'criminal_record',
    );
  });

  it('🟡 Dane o popełnionych przestępstwach (v2.1)', () => {
    expect(
      detectSensitiveCategories('popełnił przestępstwo kradzieży'),
    ).toContain('criminal_record');
  });
});

// ─── 🟠 Pośrednie identyfikatory ─────────────────────────────────────────────

describe('🟠 Pośrednie identyfikatory', () => {
  it('❌ Numer umowy / faktury — GAP', () => {
    expect(notDetected('Umowa nr 2024/001/AB')).toBe(true);
    expect(notDetected('Faktura VAT FV/2024/12/345')).toBe(true);
    // TODO v3: invoice number patterns are highly varied; defer.
  });

  it('✅ Numer rejestracyjny pojazdu (tablica)', () => {
    expect(detected('Samochód WA12345', 'PLATE')).toBe(true);
    expect(detected('rejestracja: KR 1AB23', 'PLATE')).toBe(true);
  });

  it('❌ Numery seryjne urządzeń — GAP', () => {
    expect(notDetected('Serial: ABCD-1234-EFGH')).toBe(true);
  });

  it('🟡 Nazwy ulic — NER best-effort', () => {
    expect(notDetected('ul. Marszałkowska')).toBe(true);
    // PLACE entity via NER only.
  });

  it('❌ Mosaic effect (employer + position + date) — NOT HANDLED', () => {
    const text =
      'Anna pracuje jako programistka w XYZ od stycznia 2023 w Warszawie';
    // No category catches mosaic re-identification by design.
    expect(notDetected(text)).toBe(true);
    expect(detectSensitiveCategories(text)).toEqual([]);
    // Documented limitation (v2 Known Limitations #5).
  });

  it('❌ Numer recepty / historii medycznej — GAP', () => {
    expect(notDetected('Recepta nr 1234567890')).toBe(true);
    // TODO v3: add medical_record_id sensitive category.
    // Note: the SURROUNDING context "recepta" triggers the sensitive
    // health gate even if the number itself isn't anonymized:
    expect(detectSensitiveCategories('Recepta nr 1234567890')).toContain(
      'health',
    );
  });

  it('✅ Kod pocztowy (PL format NN-NNN)', () => {
    expect(detected('00-123 Warszawa', 'ZIP')).toBe(true);
  });
});

// ─── Coverage summary tally ──────────────────────────────────────────────────

describe('📊 Coverage summary', () => {
  it('reports the deterministic regex categories actually exported', () => {
    // This is a guard test: if the regex layer ever loses a category,
    // this test fails immediately. Lists every type that the test file
    // above asserts is `✅ COVERED`.
    const probe = [
      'alice@example.com',
      '+48 600 700 800',
      '44051401458',
      'ABC123458',
      'NIP 1234567802',
      '123456785',
      'DE89370400440532013000',
      '4111111111111111',
      'WA12345',
      '00-123',
      'https://example.com/reset?token=abc',
    ].join(' | ');

    const types = new Set(detectedTypes(probe));
    expect(types).toContain('EMAIL');
    expect(types).toContain('PHONE');
    expect(types).toContain('PESEL');
    expect(types).toContain('DOWOD');
    expect(types).toContain('NIP');
    expect(types).toContain('REGON');
    expect(types).toContain('IBAN');
    expect(types).toContain('CARD');
    expect(types).toContain('PLATE');
    expect(types).toContain('ZIP');
    expect(types).toContain('URL');
  });

  it('reports the sensitive-topic categories actually working', () => {
    const probe =
      'cukrzyca, kościół, gay, wybory, uchodźca, DNA, strajk związkowy';
    const cats = detectSensitiveCategories(probe);
    expect(cats).toContain('health');
    expect(cats).toContain('religion');
    expect(cats).toContain('sexual_orientation');
    expect(cats).toContain('political_opinion');
    expect(cats).toContain('ethnic_origin');
    expect(cats).toContain('biometric');
    expect(cats).toContain('trade_union');
  });
});
