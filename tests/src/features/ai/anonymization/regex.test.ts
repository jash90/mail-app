import {
  detectRegex,
  regexScan,
  applyRegexAnonymization,
  isValidPESEL,
  isValidNIP,
  isValidIBAN,
  isValidLuhn,
  isValidREGON,
  isValidDowodOsobisty,
  isValidPLPlate,
  isValidPLPassport,
  isValidKRS,
  isValidIPv4,
  isValidIPv6,
  isValidMAC,
  isValidDate,
  isValidGPS,
} from '@/src/features/ai/anonymization/regex';
import { PlaceholderMap } from '@/src/features/ai/anonymization/placeholders';

// ─── Validators ──────────────────────────────────────────────────────────────

describe('isValidPESEL', () => {
  it('accepts a PESEL with a correct checksum', () => {
    // 44051401458 — canonical sample from Polish government documentation.
    expect(isValidPESEL('44051401458')).toBe(true);
  });
  it('rejects a PESEL with a bad checksum', () => {
    expect(isValidPESEL('44051401459')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidPESEL('4405140145')).toBe(false);
    expect(isValidPESEL('440514014580')).toBe(false);
  });
  it('rejects non-digit input', () => {
    expect(isValidPESEL('4405140145a')).toBe(false);
  });
});

describe('isValidNIP', () => {
  it('accepts a NIP with a correct checksum (bare and dashed)', () => {
    // Hand-verified: weights [6,5,7,2,3,4,5,6,7] · 123456780 = 167; 167 % 11 = 2.
    expect(isValidNIP('1234567802')).toBe(true);
    expect(isValidNIP('123-456-78-02')).toBe(true);
    // Trivial edge case: all zeros. Sum = 0, control = 0.
    expect(isValidNIP('0000000000')).toBe(true);
    // All ones. Sum = 45, 45 % 11 = 1.
    expect(isValidNIP('1111111111')).toBe(true);
  });
  it('rejects a NIP with a bad checksum', () => {
    expect(isValidNIP('1234567803')).toBe(false);
    expect(isValidNIP('1111111112')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidNIP('525228708')).toBe(false);
  });
});

describe('isValidIBAN', () => {
  it('accepts known-good IBANs', () => {
    expect(isValidIBAN('GB82WEST12345698765432')).toBe(true);
    expect(isValidIBAN('DE89370400440532013000')).toBe(true);
  });
  it('rejects broken checksums', () => {
    expect(isValidIBAN('GB82WEST12345698765433')).toBe(false);
  });
  it('ignores whitespace', () => {
    expect(isValidIBAN('GB82 WEST 1234 5698 7654 32')).toBe(true);
  });
});

describe('isValidREGON', () => {
  it('accepts a valid 9-digit REGON', () => {
    // Hand-verified: [8,9,2,3,4,5,6,7] · 12345678 = 192; 192 % 11 = 5.
    expect(isValidREGON('123456785')).toBe(true);
    // All zeros: sum 0, control 0.
    expect(isValidREGON('000000000')).toBe(true);
  });
  it('accepts a valid 14-digit REGON', () => {
    // Hand-verified checksum for 12345678901235.
    expect(isValidREGON('12345678901235')).toBe(true);
    expect(isValidREGON('00000000000000')).toBe(true);
  });
  it('rejects wrong checksum', () => {
    expect(isValidREGON('123456786')).toBe(false);
    expect(isValidREGON('12345678901236')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidREGON('12345')).toBe(false);
    expect(isValidREGON('1234567890')).toBe(false); // 10 digits
    expect(isValidREGON('123456789012')).toBe(false); // 12 digits
  });
  it('rejects non-digit input', () => {
    expect(isValidREGON('12345678A')).toBe(false);
  });
});

describe('isValidDowodOsobisty', () => {
  it('accepts a hand-verified valid dowód', () => {
    // ABC123458: A=10, B=11, C=12, 2, 3, 4, 5, 8
    // sum (skip idx 3) = 10*7+11*3+12*1+2*7+3*3+4*1+5*7+8*3 = 201; 201 % 10 = 1
    // Checksum digit (index 3) = 1. Valid.
    expect(isValidDowodOsobisty('ABC123458')).toBe(true);
    // ABA300000: sum = 70+33+10+0+0+0+0+0 = 113; 113 % 10 = 3. Valid.
    expect(isValidDowodOsobisty('ABA300000')).toBe(true);
  });
  it('rejects wrong checksum', () => {
    expect(
      isValidDowodOsobisty(
        'ABC123458'.slice(0, 3) + '2' + 'ABC123458'.slice(4),
      ),
    ).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(isValidDowodOsobisty('AB123456')).toBe(false); // 2 letters
    expect(isValidDowodOsobisty('ABCD12345')).toBe(false); // 4 letters
    expect(isValidDowodOsobisty('ABC12345')).toBe(false); // 5 digits
    expect(isValidDowodOsobisty('abc123458')).toBe(false); // lowercase
  });
});

describe('isValidPLPlate', () => {
  it('accepts a valid PL plate with and without space', () => {
    expect(isValidPLPlate('WA 12345')).toBe(true);
    expect(isValidPLPlate('WA12345')).toBe(true);
    expect(isValidPLPlate('WOD 1234')).toBe(true);
    expect(isValidPLPlate('KR 12A34')).toBe(true);
  });
  it('rejects pure-letter sequences (no digit)', () => {
    expect(isValidPLPlate('THE NEWS')).toBe(false);
    expect(isValidPLPlate('ABCDEFG')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidPLPlate('W 1234')).toBe(false); // 1-letter prefix
    expect(isValidPLPlate('WA 12')).toBe(false); // 2-digit suffix
    expect(isValidPLPlate('ABCD 1234')).toBe(false); // 4-letter prefix
  });
});

// ─── v2.1 extended validators ────────────────────────────────────────────────

describe('isValidPLPassport', () => {
  it('accepts valid format (2 letters + 7 digits)', () => {
    expect(isValidPLPassport('AA1234567')).toBe(true);
    expect(isValidPLPassport('ZZ0000000')).toBe(true);
  });
  it('rejects wrong format', () => {
    expect(isValidPLPassport('A12345678')).toBe(false); // 1 letter
    expect(isValidPLPassport('AAA123456')).toBe(false); // 3 letters
    expect(isValidPLPassport('AA12345')).toBe(false); // 5 digits
    expect(isValidPLPassport('aa1234567')).toBe(false); // lowercase
  });
});

describe('isValidKRS', () => {
  it('accepts 10 digits starting with 0', () => {
    expect(isValidKRS('0000123456')).toBe(true);
    expect(isValidKRS('0999999999')).toBe(true);
  });
  it('rejects non-zero leading digit', () => {
    expect(isValidKRS('1000000000')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidKRS('000012345')).toBe(false); // 9
    expect(isValidKRS('00001234567')).toBe(false); // 11
  });
});

describe('isValidIPv4', () => {
  it('accepts canonical IPv4 addresses', () => {
    expect(isValidIPv4('192.168.1.1')).toBe(true);
    expect(isValidIPv4('8.8.8.8')).toBe(true);
    expect(isValidIPv4('0.0.0.0')).toBe(true);
    expect(isValidIPv4('255.255.255.255')).toBe(true);
  });
  it('rejects out-of-range octets', () => {
    expect(isValidIPv4('999.999.999.999')).toBe(false);
    expect(isValidIPv4('256.0.0.1')).toBe(false);
  });
  it('rejects leading-zero non-canonical forms', () => {
    expect(isValidIPv4('01.02.03.04')).toBe(false);
  });
  it('rejects wrong number of octets', () => {
    expect(isValidIPv4('1.2.3')).toBe(false);
    expect(isValidIPv4('1.2.3.4.5')).toBe(false);
  });
});

describe('isValidIPv6', () => {
  it('accepts full-form IPv6', () => {
    expect(isValidIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
  });
  it('accepts compressed forms', () => {
    expect(isValidIPv6('2001:db8:85a3::8a2e:370:7334')).toBe(true);
    expect(isValidIPv6('::1')).toBe(true);
  });
  it('rejects non-hex characters', () => {
    expect(isValidIPv6('gggg::1')).toBe(false);
  });
});

describe('isValidMAC', () => {
  it('accepts colon and dash separators', () => {
    expect(isValidMAC('00:1B:44:11:3A:B7')).toBe(true);
    expect(isValidMAC('00-1B-44-11-3A-B7')).toBe(true);
    expect(isValidMAC('00:1b:44:11:3a:b7')).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(isValidMAC('00:1B:44:11:3A')).toBe(false);
    expect(isValidMAC('00:1B:44:11:3A:B7:C8')).toBe(false);
  });
  it('rejects non-hex chars', () => {
    expect(isValidMAC('00:1B:44:ZZ:3A:B7')).toBe(false);
  });
});

describe('isValidDate', () => {
  it('accepts ISO format YYYY-MM-DD', () => {
    expect(isValidDate('1990-01-15')).toBe(true);
    expect(isValidDate('2024-12-31')).toBe(true);
  });
  it('accepts PL format DD.MM.YYYY', () => {
    expect(isValidDate('15.01.1990')).toBe(true);
    expect(isValidDate('31/12/2024')).toBe(true);
    expect(isValidDate('01-06-2000')).toBe(true);
  });
  it('rejects nonsense day/month', () => {
    expect(isValidDate('45.99.2000')).toBe(false);
    expect(isValidDate('2024-13-01')).toBe(false);
    expect(isValidDate('2024-12-32')).toBe(false);
  });
  it('rejects out-of-range year', () => {
    expect(isValidDate('1899-01-01')).toBe(false);
    expect(isValidDate('2101-01-01')).toBe(false);
  });
});

describe('isValidGPS', () => {
  it('accepts coordinate pairs within Earth range', () => {
    expect(isValidGPS('52.2297, 21.0122')).toBe(true); // Warsaw
    expect(isValidGPS('-33.8688, 151.2093')).toBe(true); // Sydney
  });
  it('rejects out-of-range latitude or longitude', () => {
    expect(isValidGPS('91.0000, 21.0122')).toBe(false);
    expect(isValidGPS('52.2297, 181.0000')).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(isValidGPS('52,21')).toBe(false);
    expect(isValidGPS('52.2297')).toBe(false);
  });
});

describe('v2.1 detectRegex — new categories', () => {
  it('detects PASSPORT (PL format)', () => {
    const entities = detectRegex('Passport no. AA1234567 expires 2030');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'PASSPORT', value: 'AA1234567' }),
    );
  });

  it('detects KRS (starts with 0, before NIP)', () => {
    const entities = detectRegex('Spółka KRS: 0000123456');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'KRS', value: '0000123456' }),
    );
  });

  it('detects IPv4 and IPv6 as IP', () => {
    expect(detectRegex('IP 192.168.1.1')).toContainEqual(
      expect.objectContaining({ type: 'IP', value: '192.168.1.1' }),
    );
    expect(detectRegex('server ::1 is local')).toContainEqual(
      expect.objectContaining({ type: 'IP' }),
    );
  });

  it('detects MAC addresses', () => {
    expect(detectRegex('MAC 00:1B:44:11:3A:B7')).toContainEqual(
      expect.objectContaining({ type: 'MAC' }),
    );
  });

  it('detects dates (ISO and PL)', () => {
    expect(detectRegex('Data 15.01.1990')).toContainEqual(
      expect.objectContaining({ type: 'DATE', value: '15.01.1990' }),
    );
    expect(detectRegex('created 2024-06-15')).toContainEqual(
      expect.objectContaining({ type: 'DATE', value: '2024-06-15' }),
    );
  });

  it('detects GPS coordinates', () => {
    expect(detectRegex('Warsaw at 52.2297, 21.0122')).toContainEqual(
      expect.objectContaining({ type: 'GPS' }),
    );
  });

  it('detects currency amounts', () => {
    expect(detectRegex('Pensja 8500 zł')).toContainEqual(
      expect.objectContaining({ type: 'AMOUNT' }),
    );
    expect(detectRegex('Total 50000 EUR')).toContainEqual(
      expect.objectContaining({ type: 'AMOUNT' }),
    );
    expect(detectRegex('Price $199.99')).toContainEqual(
      expect.objectContaining({ type: 'AMOUNT' }),
    );
  });

  it('detects PL landline in 2+3+2+2 grouping', () => {
    expect(detectRegex('Tel. 22 555 12 34')).toContainEqual(
      expect.objectContaining({ type: 'PHONE', value: '22 555 12 34' }),
    );
  });

  it('does not misclassify KRS as NIP (priority order)', () => {
    const entities = detectRegex('KRS 0000123456');
    const types = entities.map((e) => e.type);
    expect(types).toContain('KRS');
    expect(types).not.toContain('NIP');
  });

  it('does not misclassify dates as phone/pesel', () => {
    const entities = detectRegex('urodzony 15.01.1990');
    const types = entities.map((e) => e.type);
    expect(types).toContain('DATE');
    expect(types).not.toContain('PHONE');
    expect(types).not.toContain('PESEL');
  });
});

describe('isValidLuhn', () => {
  it('accepts canonical test cards', () => {
    // Visa test
    expect(isValidLuhn('4111111111111111')).toBe(true);
    // Mastercard test
    expect(isValidLuhn('5500000000000004')).toBe(true);
    // American Express test
    expect(isValidLuhn('340000000000009')).toBe(true);
  });
  it('accepts cards with spaces/dashes', () => {
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
    expect(isValidLuhn('4111-1111-1111-1111')).toBe(true);
  });
  it('rejects bad checksums', () => {
    expect(isValidLuhn('4111111111111112')).toBe(false);
  });
  it('rejects short or long strings', () => {
    expect(isValidLuhn('411111')).toBe(false);
    expect(isValidLuhn('41111111111111111111')).toBe(false);
  });
});

// ─── detectRegex ─────────────────────────────────────────────────────────────

describe('detectRegex', () => {
  it('detects email addresses', () => {
    const entities = detectRegex('Kontakt: alice@example.com — do jutra.');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'EMAIL', value: 'alice@example.com' }),
    );
  });

  it('detects a Polish phone with country code and spaces', () => {
    const entities = detectRegex('Zadzwoń: +48 600 700 800');
    const phones = entities.filter((e) => e.type === 'PHONE');
    expect(phones.length).toBeGreaterThan(0);
    expect(phones[0]!.value).toContain('600');
  });

  it('detects a bare 9-digit Polish phone', () => {
    const entities = detectRegex('Tel. 600700800 do recepcji');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'PHONE', value: '600700800' }),
    );
  });

  it('detects a valid PESEL', () => {
    const entities = detectRegex('PESEL: 44051401458');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'PESEL', value: '44051401458' }),
    );
  });

  it('does NOT flag an 11-digit string with a bad checksum as PESEL', () => {
    const entities = detectRegex('Numer kontrolny: 12345678901');
    const pesels = entities.filter((e) => e.type === 'PESEL');
    expect(pesels.length).toBe(0);
  });

  it('detects IBAN', () => {
    const entities = detectRegex('IBAN: DE89370400440532013000');
    expect(entities).toContainEqual(expect.objectContaining({ type: 'IBAN' }));
  });

  it('detects PL postal code', () => {
    const entities = detectRegex('Adres: ul. Warszawska 1, 00-123 Warszawa');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'ZIP', value: '00-123' }),
    );
  });

  it('detects URL with token parameter', () => {
    const entities = detectRegex(
      'Reset hasła: https://example.com/reset?token=abc123xyz456',
    );
    expect(entities).toContainEqual(expect.objectContaining({ type: 'URL' }));
  });

  it('detects Luhn-valid credit card', () => {
    const entities = detectRegex('Karta: 4111111111111111, CVV 123');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'CARD', value: '4111111111111111' }),
    );
  });

  it('returns empty for text without PII', () => {
    expect(detectRegex('Dzień dobry, jak się masz?')).toEqual([]);
  });

  it('detects valid REGON and prevents it being classified as PHONE', () => {
    const entities = detectRegex('REGON: 123456785');
    const types = entities.map((e) => e.type);
    expect(types).toContain('REGON');
    expect(types).not.toContain('PHONE');
  });

  it('detects valid 14-digit REGON', () => {
    const entities = detectRegex('Oddział: 12345678901235');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'REGON', value: '12345678901235' }),
    );
  });

  it('detects valid dowód osobisty', () => {
    const entities = detectRegex('Seria i numer: ABC123458');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'DOWOD', value: 'ABC123458' }),
    );
  });

  it('detects PL license plate', () => {
    const entities = detectRegex('Samochód: WA 12345 parkuje tutaj');
    expect(entities).toContainEqual(
      expect.objectContaining({ type: 'PLATE', value: 'WA 12345' }),
    );
  });

  it('does not flag random uppercase phrases as plates', () => {
    const entities = detectRegex('I read THE NEWS yesterday');
    const plates = entities.filter((e) => e.type === 'PLATE');
    expect(plates.length).toBe(0);
  });

  it('does not double-flag a PESEL as a phone substring', () => {
    const entities = detectRegex('PESEL: 44051401458 koniec');
    const types = entities.map((e) => e.type);
    expect(types).toContain('PESEL');
    expect(types).not.toContain('PHONE');
  });

  it('does not double-flag an email as a URL or separate parts', () => {
    const entities = detectRegex('Write to alice@example.com please');
    expect(entities.filter((e) => e.type === 'EMAIL').length).toBe(1);
  });
});

// ─── regexScan ───────────────────────────────────────────────────────────────

describe('regexScan', () => {
  it('returns empty for fully anonymized text', () => {
    expect(regexScan('Kontakt <EMAIL_1> lub <PHONE_1>.')).toEqual([]);
  });

  it('returns the same results as detectRegex', () => {
    const text = 'alice@example.com, PESEL 44051401458';
    expect(regexScan(text).length).toBe(detectRegex(text).length);
  });

  it('flags a surviving email as a leak', () => {
    const anonymized = 'Contact <NAME_1> at real@leak.com today.';
    const leaks = regexScan(anonymized);
    expect(leaks.length).toBe(1);
    expect(leaks[0]!).toEqual(
      expect.objectContaining({ type: 'EMAIL', value: 'real@leak.com' }),
    );
  });
});

// ─── applyRegexAnonymization ─────────────────────────────────────────────────

describe('applyRegexAnonymization', () => {
  it('replaces detected entities with placeholders', () => {
    const map = new PlaceholderMap();
    const input = 'Email alice@example.com, PESEL 44051401458';
    const output = applyRegexAnonymization(input, map);

    expect(output).toContain('<EMAIL_1>');
    expect(output).toContain('<PESEL_1>');
    expect(output).not.toContain('alice@example.com');
    expect(output).not.toContain('44051401458');
  });

  it('reuses the same placeholder for a duplicate value', () => {
    const map = new PlaceholderMap();
    const input = 'From alice@acme.com. Reply to alice@acme.com.';
    const output = applyRegexAnonymization(input, map);

    const occurrences = output.match(/<EMAIL_1>/g) ?? [];
    expect(occurrences.length).toBe(2);
    expect(map.size).toBe(1);
  });

  it('leaves PII-free text untouched', () => {
    const map = new PlaceholderMap();
    const input = 'Dzień dobry, jak się masz?';
    expect(applyRegexAnonymization(input, map)).toBe(input);
  });

  it('produces output that passes the safety re-scan', () => {
    const map = new PlaceholderMap();
    const input = [
      'Email: alice@example.com',
      'PESEL: 44051401458',
      'Phone: +48 600 700 800',
      'IBAN: DE89370400440532013000',
      'Card: 4111111111111111',
      'ZIP: 00-123',
      'Reset: https://example.com/reset?token=abc123xyz',
    ].join('\n');

    const output = applyRegexAnonymization(input, map);
    expect(regexScan(output)).toEqual([]);
  });
});
