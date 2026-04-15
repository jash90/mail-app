/**
 * GDPR Art. 9 sensitive-topic detector.
 *
 * This is a DETECTION gate, not anonymization. When any listed keyword
 * appears in a user message, `anonymizingCloudProvider` hard-fails the
 * cloud call with `ANONYMIZATION_SENSITIVE_TOPIC`, forcing the user to
 * either scrub the content or switch to the local provider.
 *
 * Why detection and not anonymization: there is no meaningful way to
 * anonymize "the patient has diabetes" — the statement itself is the
 * sensitive fact. A small local NER model cannot reliably recognize
 * health, religion, or sexual-orientation *context*. The only honest
 * posture is: if we see a keyword from a sensitive category, refuse
 * cloud AI for that message.
 *
 * False positives are accepted by design. Over-blocking (a neutral
 * business email that happens to contain "election") degrades the AI
 * feature for that thread. Under-blocking leaks regulated data to a
 * third-party provider. We optimize for the latter risk.
 *
 * The list is a seed — iterate based on real-world feedback.
 */

export type SensitiveCategory =
  | 'health'
  | 'religion'
  | 'sexual_orientation'
  | 'political_opinion'
  | 'ethnic_origin'
  | 'biometric'
  | 'trade_union'
  // GDPR Art. 10 — criminal convictions, offences, related security measures.
  // Treated with the same hard-block policy as Art. 9: the keyword gate fires
  // before the pipeline runs and the cloud call is refused.
  | 'criminal_record';

export interface SensitiveMatch {
  category: SensitiveCategory;
  keyword: string;
}

interface KeywordEntry {
  category: SensitiveCategory;
  keywords: readonly string[];
}

/**
 * Polish + English keyword list per sensitive category.
 *
 * Polish inflection is partial: the most common noun forms are included
 * per root. A real stemming-based detector is follow-up work.
 */
const KEYWORD_TABLE: readonly KeywordEntry[] = [
  {
    category: 'health',
    keywords: [
      // Polish — disease / diagnosis / treatment (include common inflections)
      'choroba',
      'choroby',
      'chorób',
      'chorobie',
      'chorobą',
      'chorobę',
      'chorobami',
      'chorobach',
      'chorobom',
      'chory',
      'chora',
      'chorzy',
      'diagnoza',
      'diagnozy',
      'diagnozę',
      'diagnozą',
      'diagnozami',
      'leczenie',
      'leczenia',
      'leczeniu',
      'leczeniem',
      'leki',
      'leków',
      'lekami',
      'lekarstwo',
      'lekarstwa',
      'lekarstwem',
      'lekarstwami',
      'recepta',
      'recepty',
      'receptę',
      'receptą',
      'terapia',
      'terapii',
      'terapię',
      'terapią',
      'objawy',
      'objawów',
      // Polish — specific conditions and specialists
      'ciąża',
      'ciąży',
      'ciążę',
      'ciążą',
      'depresja',
      'depresji',
      'depresję',
      'depresją',
      'rak',
      'raka',
      'rakiem',
      'cukrzyca',
      'cukrzycy',
      'cukrzycę',
      'cukrzycą',
      'onkolog',
      'onkologa',
      'onkologii',
      'psychiatra',
      'psychiatry',
      'psychiatrę',
      'psychiatrą',
      'psychiatryczny',
      'szpital',
      'szpitala',
      'szpitalem',
      'szpitalu',
      'szpitali',
      'klinika',
      'kliniki',
      'klinice',
      'kliniką',
      // English
      'disease',
      'diagnosis',
      'treatment',
      'medication',
      'therapy',
      'symptoms',
      'pregnancy',
      'depression',
      'cancer',
      'diabetes',
      'oncology',
      'psychiatric',
      'hospital',
      'clinic',
      // Acronyms (still case-insensitive — matches "hiv" too)
      'HIV',
      'AIDS',
    ],
  },
  {
    category: 'religion',
    keywords: [
      'wiara',
      'wiary',
      'wiarę',
      'wiarą',
      'modlitwa',
      'modlitwy',
      'modlitwie',
      'modlitwę',
      'modlitwą',
      'modlitw',
      'modlitwami',
      'kościół',
      'kościoła',
      'kościele',
      'kościołem',
      'kościoły',
      'kościołów',
      'meczet',
      'meczetu',
      'meczecie',
      'synagoga',
      'synagogi',
      'synagodze',
      'buddyzm',
      'islam',
      'judaizm',
      'katolicki',
      'katolicka',
      'katolickiego',
      'ateista',
      'ateistka',
      'religion',
      'prayer',
      'church',
      'mosque',
      'synagogue',
      'buddhism',
      'catholic',
      'jewish',
      'muslim',
      'atheist',
    ],
  },
  {
    category: 'sexual_orientation',
    keywords: [
      'LGBT',
      'LGBTQ',
      'gej',
      'lesbijka',
      'biseksualny',
      'biseksualna',
      'transpłciowy',
      'transpłciowa',
      'coming out',
      'gay',
      'lesbian',
      'bisexual',
      'transgender',
      'queer',
    ],
  },
  {
    category: 'political_opinion',
    keywords: [
      // Polish — avoid `PO`/`KO` (collide with common Polish prepositions)
      'partia polityczna',
      'wybory',
      'wyborów',
      'wyborami',
      'wyborach',
      'głosowanie',
      'głosowania',
      'głosowaniu',
      'głosowaniem',
      'Lewica',
      'Konfederacja',
      // English
      'political party',
      'voting',
      'election',
      'liberal',
      'conservative',
      'democrat',
      'republican',
    ],
  },
  {
    category: 'ethnic_origin',
    keywords: [
      'pochodzenie etniczne',
      'narodowość romska',
      'uchodźca',
      'ethnicity',
      'ethnic origin',
      'roma',
      'refugee status',
    ],
  },
  {
    category: 'biometric',
    keywords: [
      'DNA',
      'genetyczny',
      'genetyczna',
      'biometria',
      'odcisk palca',
      'genetic',
      'biometric',
      'fingerprint',
    ],
  },
  {
    category: 'trade_union',
    keywords: [
      'związek zawodowy',
      'związki zawodowe',
      'strajk',
      'trade union',
      'strike action',
    ],
  },
  {
    // GDPR Art. 10 — data relating to criminal convictions and offences.
    // These are not technically "special category" under Art. 9 but require
    // equivalent protection; we gate them through the same mechanism.
    category: 'criminal_record',
    keywords: [
      // Polish — convictions / sentencing
      'wyrok',
      'wyroku',
      'wyroki',
      'wyroków',
      'wyrokiem',
      'wyrokowi',
      'skazany',
      'skazana',
      'skazani',
      'skazanie',
      'skazania',
      'skazaniem',
      // Polish — offences / police / courts
      'przestępstwo',
      'przestępstwa',
      'przestępstwem',
      'przestępstw',
      'wykroczenie',
      'wykroczenia',
      'areszt',
      'aresztu',
      'aresztowanie',
      'aresztowany',
      'aresztowana',
      'prokurator',
      'prokuratury',
      'prokuraturze',
      'oskarżony',
      'oskarżenia',
      'kara pozbawienia wolności',
      'kartoteka karna',
      'rejestr skazanych',
      'recydywa',
      'recydywy',
      // English
      'conviction',
      'convicted',
      'convictions',
      'sentence',
      'sentenced',
      'sentencing',
      'criminal record',
      'criminal records',
      'arrest record',
      'arrested',
      'felony',
      'felonies',
      'misdemeanor',
      'prison sentence',
      'parole',
      'probation',
    ],
  },
];

interface CompiledEntry {
  category: SensitiveCategory;
  keyword: string;
  regex: RegExp;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a Unicode-aware whole-word regex for a keyword.
 *
 * `\p{L}` with the `u` flag treats Polish diacritics (ą, ć, ę, ...) as
 * letters, so keywords like "ciąża" don't match mid-word inside
 * "ciążanie" and keywords like "rak" don't match inside "rakieta".
 */
function buildKeywordRegex(keyword: string): RegExp {
  const escaped = escapeRegex(keyword);
  return new RegExp(`(?<![\\p{L}0-9_])${escaped}(?![\\p{L}0-9_])`, 'iu');
}

const COMPILED: readonly CompiledEntry[] = KEYWORD_TABLE.flatMap((entry) =>
  entry.keywords.map((keyword) => ({
    category: entry.category,
    keyword,
    regex: buildKeywordRegex(keyword),
  })),
);

/**
 * Scan text for GDPR Art. 9 sensitive-topic keywords.
 *
 * Returns every match (category + keyword) found. Single-keyword trigger
 * is sufficient — downstream `anonymizingCloudProvider` hard-fails on
 * the first match, refusing the cloud call.
 *
 * Matching is case-insensitive with Unicode-aware word boundaries. See
 * `buildKeywordRegex` for details.
 */
export function detectSensitiveTopics(text: string): SensitiveMatch[] {
  if (!text) return [];
  const matches: SensitiveMatch[] = [];
  for (const entry of COMPILED) {
    if (entry.regex.test(text)) {
      matches.push({ category: entry.category, keyword: entry.keyword });
    }
  }
  return matches;
}

/**
 * Returns the set of distinct categories detected in `text`. Useful for
 * user-facing error messages that summarize "detected sensitive content
 * (health, religion)".
 */
export function detectSensitiveCategories(text: string): SensitiveCategory[] {
  const set = new Set<SensitiveCategory>();
  for (const match of detectSensitiveTopics(text)) {
    set.add(match.category);
  }
  return [...set];
}
