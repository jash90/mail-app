import type { Entity, EntityType } from './types';
import { PlaceholderMap } from './placeholders';

// ─────────────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polish PESEL checksum. 11 digits; last digit is control.
 * See: https://en.wikipedia.org/wiki/PESEL
 */
export function isValidPESEL(pesel: string): boolean {
  if (!/^\d{11}$/.test(pesel)) return false;
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(pesel[i]!) * weights[i]!;
  }
  const control = (10 - (sum % 10)) % 10;
  return control === Number(pesel[10]!);
}

/**
 * Polish NIP checksum. 10 digits; last digit is control.
 * See: https://en.wikipedia.org/wiki/VAT_identification_number
 */
export function isValidNIP(nip: string): boolean {
  const digits = nip.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]!) * weights[i]!;
  }
  const control = sum % 11;
  return control < 10 && control === Number(digits[9]!);
}

/**
 * IBAN mod-97 check (ISO 13616). Accepts any country code.
 */
export function isValidIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) return false;

  // Move first 4 chars to end and convert letters to numbers (A=10..Z=35).
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    (ch.charCodeAt(0) - 55).toString(),
  );

  // Chunked mod-97 to avoid BigInt.
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder + numeric.substring(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}

/**
 * Luhn check for credit card numbers (13–19 digits).
 */
export function isValidLuhn(digits: string): boolean {
  const cleaned = digits.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(cleaned)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let d = Number(cleaned[i]!);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Polish REGON (business registry) checksum. Accepts 9-digit and 14-digit
 * variants per GUS spec.
 *
 * 9-digit:  weights [8,9,2,3,4,5,6,7], sum mod 11; control = 0 if remainder = 10
 * 14-digit: weights [2,4,8,5,0,9,7,3,6,1,2,4,8], sum mod 11; same 10→0 rule
 */
export function isValidREGON(regon: string): boolean {
  if (!/^\d{9}$/.test(regon) && !/^\d{14}$/.test(regon)) return false;
  const digits = regon.split('').map(Number);

  const weights =
    regon.length === 9
      ? [8, 9, 2, 3, 4, 5, 6, 7]
      : [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];

  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += digits[i]! * weights[i]!;
  }
  let control = sum % 11;
  if (control === 10) control = 0;
  return control === digits[digits.length - 1]!;
}

/**
 * Polish "dowód osobisty" (legacy ID card) checksum. Format: 3 uppercase
 * letters + 6 digits = 9 chars. The 4th character (index 3, first digit)
 * is the checksum.
 *
 * Letter values: A=10, B=11, ..., Z=35.
 * Weights for non-checksum positions [0,1,2,4,5,6,7,8]: [7,3,1,7,3,1,7,3]
 * checksum = sum mod 10, must equal digit at index 3.
 */
export function isValidDowodOsobisty(id: string): boolean {
  if (!/^[A-Z]{3}\d{6}$/.test(id)) return false;

  const values = id.split('').map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch >= 'A' && ch <= 'Z') return code - 65 + 10;
    return Number(ch);
  });

  // Weights apply to positions other than index 3 (the checksum itself).
  const weights: Record<number, number> = {
    0: 7,
    1: 3,
    2: 1,
    4: 7,
    5: 3,
    6: 1,
    7: 7,
    8: 3,
  };

  let sum = 0;
  for (const idxStr of Object.keys(weights)) {
    const i = Number(idxStr);
    sum += values[i]! * weights[i]!;
  }
  const control = sum % 10;
  return control === values[3]!;
}

/**
 * Polish vehicle license plate. Format: 2–3 letter regional prefix
 * (optionally followed by a space), then a digit as the first suffix
 * character, then 3–4 more alphanumerics.
 *
 * Requiring a digit at the start of the suffix rejects false positives
 * like "THE NEWS" (pure letters) and "ABCD 1234" (4-letter prefix
 * misread as 3 letters + digit).
 */
export function isValidPLPlate(plate: string): boolean {
  const compact = plate.replace(/\s/g, '');
  return /^[A-Z]{2,3}\d[A-Z0-9]{3,4}$/.test(compact);
}

// ─────────────────────────────────────────────────────────────────────────────
// v2.1 extended validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polish passport format check. 2 uppercase letters + 7 digits.
 * No checksum validation (algorithm varies across sources; format-only
 * check is sufficient paired with the interval-overlap logic that stops
 * false positives from being classified as IBAN or DOWOD).
 */
export function isValidPLPassport(passport: string): boolean {
  return /^[A-Z]{2}\d{7}$/.test(passport);
}

/**
 * Polish KRS (Krajowy Rejestr Sądowy) business registry number.
 * 10 digits starting with 0. No official checksum. Leading-zero
 * requirement rejects most NIP-like false positives (NIPs rarely
 * start with 0).
 */
export function isValidKRS(krs: string): boolean {
  return /^0\d{9}$/.test(krs);
}

/**
 * IPv4 address with octet range validation. Rejects sequences like
 * "999.999.999.999" and leading-zero variants like "01.02.03.04" that
 * aren't canonical.
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
    if (String(n) !== p) return false; // rejects "01" and " 1"
  }
  return true;
}

/**
 * IPv6 format check with proper handling of the `::` compression form.
 *
 * Accepts:
 *   - Full 8-group form:  `2001:0db8:85a3:0000:0000:8a2e:0370:7334`
 *   - Compressed middle:  `2001:db8:85a3::8a2e:370:7334`
 *   - Compressed prefix:  `::1`, `::8a2e:370:7334`
 *   - Compressed suffix:  `2001::`
 *
 * Rejects multiple `::` (invalid) and non-hex characters.
 */
export function isValidIPv6(ip: string): boolean {
  if (!/^[0-9A-Fa-f:]+$/.test(ip)) return false;

  const doubleColonCount = (ip.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return false;

  if (doubleColonCount === 1) {
    // Split around `::` — either side can be empty
    const [leftStr, rightStr] = ip.split('::');
    const leftGroups = leftStr ? leftStr.split(':') : [];
    const rightGroups = rightStr ? rightStr.split(':') : [];
    // Combined groups must be 0..7 (the :: represents at least one zero group)
    if (leftGroups.length + rightGroups.length > 7) return false;
    const all = [...leftGroups, ...rightGroups];
    return all.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g));
  }

  // No `::` — must be exactly 8 groups of 1-4 hex digits
  const groups = ip.split(':');
  if (groups.length !== 8) return false;
  return groups.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g));
}

/**
 * MAC address in standard formats: `00:1B:44:11:3A:B7` or `00-1B-44-11-3A-B7`.
 */
export function isValidMAC(mac: string): boolean {
  return /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/.test(mac);
}

/**
 * Date format check for the most common PL and ISO formats. Validates
 * day/month ranges loosely (28-31 days, 1-12 months). Rejects obvious
 * nonsense like "45.99.2000".
 */
export function isValidDate(date: string): boolean {
  // ISO: YYYY-MM-DD
  const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return rangesOK(
      Number(isoMatch[1]!),
      Number(isoMatch[2]!),
      Number(isoMatch[3]!),
    );
  }
  // PL: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const plMatch = date.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (plMatch) {
    return rangesOK(
      Number(plMatch[3]!),
      Number(plMatch[2]!),
      Number(plMatch[1]!),
    );
  }
  return false;
}

function rangesOK(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

/**
 * GPS coordinate pair `lat, lng` validation. Latitude ±90, longitude ±180.
 */
export function isValidGPS(coords: string): boolean {
  const m = coords.match(/^(-?\d{1,3}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})$/);
  if (!m) return false;
  const lat = Number(m[1]!);
  const lng = Number(m[2]!);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Polish phone patterns. Two groupings supported:
 *   - Mobile 3+3+3 (`600 700 800`, `600700800`, `+48 600 700 800`)
 *   - Landline 2+3+2+2 (`22 555 12 34`, with or without `+48`)
 */
const PL_PHONE_RE = /(?:\+48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g;
const PL_LANDLINE_RE =
  /(?:\+48[\s-]?)?\b\d{2}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2}\b/g;

/** E.164 subset: +CC followed by 8..14 digits (with optional separators). */
const INTL_PHONE_RE = /\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/g;

const PL_ZIP_RE = /\b\d{2}-\d{3}\b/g;

const PESEL_CANDIDATE_RE = /\b\d{11}\b/g;

const NIP_CANDIDATE_RE = /\b\d{3}-\d{3}-\d{2}-\d{2}\b|\b\d{10}\b/g;

const IBAN_CANDIDATE_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;

const URL_TOKEN_RE =
  /https?:\/\/\S+[?&](?:token|auth|key|session|sig|access_token|api_key|password)=\S+/gi;

/** 13–19 digit sequences with optional spaces/dashes. */
const CARD_CANDIDATE_RE = /\b(?:\d[\s-]?){12,18}\d\b/g;

/** Polish REGON candidates: 9 or 14 bare digits, validator filters. */
const REGON_9_CANDIDATE_RE = /\b\d{9}\b/g;
const REGON_14_CANDIDATE_RE = /\b\d{14}\b/g;

/** Polish dowód osobisty: 3 uppercase letters + 6 digits, checksum-validated. */
const DOWOD_CANDIDATE_RE = /\b[A-Z]{3}\d{6}\b/g;

/**
 * Polish license plate candidate. 2–3 letter regional prefix with optional
 * space, then a digit, then 3–4 more alphanumerics. Requiring a digit as
 * the first suffix character avoids false positives on pure-letter
 * phrases and 4-letter abbreviations.
 */
const PL_PLATE_CANDIDATE_RE = /\b[A-Z]{2,3} ?\d[A-Z0-9]{3,4}\b/g;

// ─────────────────────────────────────────────────────────────────────────────
// v2.1 extended patterns
// ─────────────────────────────────────────────────────────────────────────────

/** Polish passport: 2 letters + 7 digits. No checksum, format only. */
const PL_PASSPORT_CANDIDATE_RE = /\b[A-Z]{2}\d{7}\b/g;

/** KRS: 10 digits starting with 0. */
const KRS_CANDIDATE_RE = /\b0\d{9}\b/g;

/** IPv4 candidate — validator enforces octet ranges. */
const IPV4_CANDIDATE_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

/**
 * IPv6 candidate — permissive pattern covering full 8-group, compressed
 * `::` middle, and `::` prefix/suffix forms. Validator enforces strict
 * rules after the regex claims a span.
 */
const IPV6_CANDIDATE_RE = /(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f]{0,4}/g;

/** MAC address with colon or dash separators. */
const MAC_CANDIDATE_RE = /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g;

/** Date candidate — PL DD.MM.YYYY and ISO YYYY-MM-DD. */
const DATE_CANDIDATE_RE =
  /\b\d{2}[./-]\d{2}[./-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;

/** GPS coordinate pair `lat, lng` with at least 4 decimal places each. */
const GPS_CANDIDATE_RE = /-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g;

/**
 * Currency amounts: PLN / zł / EUR / € / USD / $ with number before or
 * after (currency can prefix `$100` or suffix `8500 zł`).
 *
 * Uses `\d{1,}` (not `\d{1,3}`) to allow un-grouped 4+ digit numbers.
 * Drops the trailing `\b` because `zł` ends in `ł`, which is not an
 * ASCII word char — JS `\b` doesn't fire correctly there.
 */
const AMOUNT_CANDIDATE_RE =
  /(?:\$|€)\s?\d{1,}(?:[\s,]\d{3})*(?:[.,]\d{1,2})?|\b\d{1,}(?:[\s,]\d{3})*(?:[.,]\d{1,2})?\s?(?:PLN|zł|EUR|USD)/gi;

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all regex detectors on `text` and return matched entities.
 *
 * Overlap handling: patterns are run in priority order (most specific /
 * validated first). Ranges already claimed by a higher-priority match are
 * skipped, so a PESEL is never also flagged as a 9-digit phone substring
 * within it.
 *
 * Dual-purpose:
 *   1. First-pass detection during anonymization.
 *   2. Safety re-scan after the full pipeline — if this returns anything,
 *      structured PII has leaked and the cloud call must be refused.
 */
export function detectRegex(text: string): Entity[] {
  const entities: Entity[] = [];
  const taken: Array<[number, number]> = [];

  const isTaken = (start: number, end: number): boolean => {
    for (const [s, e] of taken) {
      if (start < e && end > s) return true;
    }
    return false;
  };

  const tryPush = (
    type: EntityType,
    value: string,
    start: number,
    validator?: (v: string) => boolean,
  ): void => {
    if (validator && !validator(value)) return;
    const end = start + value.length;
    if (isTaken(start, end)) return;
    taken.push([start, end]);
    entities.push({ type, value, start, end });
  };

  // Priority order — higher-specificity patterns claim their spans first.
  // PL-specific identifiers with validators run BEFORE the generic phone
  // and card patterns so valid REGON / dowód claim their spans and phones
  // only match what's left.
  for (const m of text.matchAll(URL_TOKEN_RE)) {
    tryPush('URL', m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    tryPush('EMAIL', m[0], m.index ?? 0);
  }
  // v2.1: IPv6 first (hex colons, specific enough to not conflict)
  for (const m of text.matchAll(IPV6_CANDIDATE_RE)) {
    tryPush('IP', m[0], m.index ?? 0, isValidIPv6);
  }
  for (const m of text.matchAll(MAC_CANDIDATE_RE)) {
    tryPush('MAC', m[0], m.index ?? 0, isValidMAC);
  }
  for (const m of text.matchAll(IBAN_CANDIDATE_RE)) {
    tryPush('IBAN', m[0], m.index ?? 0, isValidIBAN);
  }
  // v2.1: passport before REGON/PESEL/NIP — letters prefix makes it unambiguous
  for (const m of text.matchAll(PL_PASSPORT_CANDIDATE_RE)) {
    tryPush('PASSPORT', m[0], m.index ?? 0, isValidPLPassport);
  }
  // v2.1: dates before any numeric patterns to claim DD.MM.YYYY / ISO spans
  for (const m of text.matchAll(DATE_CANDIDATE_RE)) {
    tryPush('DATE', m[0], m.index ?? 0, isValidDate);
  }
  // v2.1: GPS coords before standalone number patterns
  for (const m of text.matchAll(GPS_CANDIDATE_RE)) {
    tryPush('GPS', m[0], m.index ?? 0, isValidGPS);
  }
  // v2.1: currency amounts before digit-only patterns
  for (const m of text.matchAll(AMOUNT_CANDIDATE_RE)) {
    tryPush('AMOUNT', m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(REGON_14_CANDIDATE_RE)) {
    tryPush('REGON', m[0], m.index ?? 0, isValidREGON);
  }
  for (const m of text.matchAll(PESEL_CANDIDATE_RE)) {
    tryPush('PESEL', m[0], m.index ?? 0, isValidPESEL);
  }
  // v2.1: KRS before NIP — leading-zero 10-digit pattern is KRS-specific
  for (const m of text.matchAll(KRS_CANDIDATE_RE)) {
    tryPush('KRS', m[0], m.index ?? 0, isValidKRS);
  }
  for (const m of text.matchAll(NIP_CANDIDATE_RE)) {
    tryPush('NIP', m[0], m.index ?? 0, isValidNIP);
  }
  for (const m of text.matchAll(DOWOD_CANDIDATE_RE)) {
    tryPush('DOWOD', m[0], m.index ?? 0, isValidDowodOsobisty);
  }
  for (const m of text.matchAll(REGON_9_CANDIDATE_RE)) {
    tryPush('REGON', m[0], m.index ?? 0, isValidREGON);
  }
  for (const m of text.matchAll(CARD_CANDIDATE_RE)) {
    tryPush('CARD', m[0], m.index ?? 0, isValidLuhn);
  }
  for (const m of text.matchAll(PL_PHONE_RE)) {
    tryPush('PHONE', m[0], m.index ?? 0);
  }
  // v2.1: PL landline 2+3+2+2 grouping alternative
  for (const m of text.matchAll(PL_LANDLINE_RE)) {
    tryPush('PHONE', m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(INTL_PHONE_RE)) {
    tryPush('PHONE', m[0], m.index ?? 0);
  }
  // v2.1: IPv4 late — dot-separated numeric pattern, has to come AFTER
  // dates/GPS/amounts to avoid claiming their spans.
  for (const m of text.matchAll(IPV4_CANDIDATE_RE)) {
    tryPush('IP', m[0], m.index ?? 0, isValidIPv4);
  }
  for (const m of text.matchAll(PL_ZIP_RE)) {
    tryPush('ZIP', m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(PL_PLATE_CANDIDATE_RE)) {
    tryPush('PLATE', m[0], m.index ?? 0, isValidPLPlate);
  }

  return entities;
}

/**
 * Safety re-scan: returns any structured PII that survived the pipeline.
 * Used by `anonymizingCloudProvider` to hard-fail leaks before the network call.
 */
export function regexScan(text: string): Entity[] {
  return detectRegex(text);
}

/**
 * Detect structured PII in `text`, allocate placeholders into the shared
 * `map`, and return the text with originals replaced by placeholder tokens.
 *
 * The shared map is intentionally used for replacement (via `applyForward`)
 * rather than a local-only substitution so that the same value appearing in
 * multiple messages within a request always resolves to the same token.
 */
export function applyRegexAnonymization(
  text: string,
  map: PlaceholderMap,
): string {
  for (const entity of detectRegex(text)) {
    map.allocate(entity.type, entity.value);
  }
  return map.applyForward(text);
}
