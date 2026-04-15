/**
 * Canary corpus for the anonymization leak test.
 *
 * Each fixture is a realistic Polish or English email body containing at
 * least one piece of structured PII that the regex layer must detect.
 * The `leakCanary.test.ts` suite runs every fixture through the full
 * anonymization pipeline and asserts `regexScan()` returns empty on the
 * output.
 *
 * If you add a new PII category to `regex.ts`, add a fixture here that
 * exercises it — the canary is the deterministic regression guard for
 * every leak the pipeline is expected to prevent.
 */

export interface PiiEmailFixture {
  id: string;
  description: string;
  body: string;
}

export interface SensitiveEmailFixture {
  id: string;
  description: string;
  body: string;
  /** Which GDPR Art. 9 category the fixture is expected to trigger. */
  expectedCategory: string;
}

export const PII_EMAIL_FIXTURES: PiiEmailFixture[] = [
  {
    id: 'pl-invoice-bank',
    description: 'Polish invoice email with IBAN, NIP, postal code',
    body: [
      'Dzień dobry,',
      '',
      'W załączeniu faktura VAT nr 2026/04/123.',
      'Prosimy o wpłatę na konto:',
      'IBAN: PL61109010140000071219812874',
      'Dane firmy: ACME Sp. z o.o., NIP 1234567802, ul. Marszałkowska 1, 00-123 Warszawa',
      '',
      'Kontakt: biuro@acme.pl, tel. +48 600 700 800',
      '',
      'Pozdrawiam,',
      'Jan Kowalski',
    ].join('\n'),
  },
  {
    id: 'pl-gov-pesel',
    description: 'Polish government form submission referencing PESEL',
    body: [
      'Szanowny Panie,',
      '',
      'Potwierdzam rejestrację wniosku nr ePUAP/2026/0401.',
      'Numer PESEL wnioskodawcy: 44051401458',
      'Adres korespondencyjny: ul. Prosta 5, 02-145 Warszawa',
      '',
      'W razie pytań proszę o kontakt pod nr +48 22 555 12 34.',
    ].join('\n'),
  },
  {
    id: 'en-password-reset',
    description: 'English password reset email with tokenized URL',
    body: [
      'Hello,',
      '',
      'You requested a password reset. Click the link below to continue:',
      'https://accounts.example.com/reset?token=abc123def456ghi789jkl&email=john@example.com',
      '',
      'If you did not request this, please contact support at support@example.com.',
    ].join('\n'),
  },
  {
    id: 'en-payment-card',
    description: 'English order confirmation with credit card reference',
    body: [
      'Order #ACME-2026-0042 confirmed.',
      '',
      'Card used: 4111 1111 1111 1111',
      'Total: $349.99',
      'Delivery to: Jane Doe, jane.doe@example.com, +1 555-123-4567',
      'Invoice questions: billing@example.com',
    ].join('\n'),
  },
  {
    id: 'reply-thread-en',
    description: 'English reply thread with nested On..wrote: header',
    body: [
      'Thanks — I will review the contract tonight.',
      '',
      'On Mon, Jan 15 2026 at 9:30 AM Alice Chen <alice.chen@acme.com> wrote:',
      '> Hi Bob,',
      '> Please find attached the draft.',
      '> My direct line is 600 700 800 and personal cell +48 511 222 333.',
      '> IBAN for wire: DE89370400440532013000',
      '> Best, Alice',
    ].join('\n'),
  },
  {
    id: 'reply-thread-pl',
    description: 'Polish reply thread with W dniu..pisze: header',
    body: [
      'Dziękuję, odpowiem wieczorem.',
      '',
      'W dniu poniedziałek, 15 stycznia 2026 o 09:30, Kasia Nowak <kasia@acme.pl> pisze:',
      '> Cześć Jan,',
      '> W załączeniu umowa.',
      '> Numer PESEL do weryfikacji: 44051401458',
      '> Telefon: +48 600 700 800',
      '> Pozdrawiam',
    ].join('\n'),
  },
  {
    id: 'outlook-original-message',
    description:
      'Outlook-style forward with -----Original Message----- separator',
    body: [
      'FYI — looping you in on this thread.',
      '',
      '-----Original Message-----',
      'From: john.smith@example.com',
      'To: support@example.com',
      'Subject: Urgent: refund request',
      '',
      'Hi, my account number is GB82WEST12345698765432, ZIP 01-234.',
      'Please call me at +48 500 600 700.',
    ].join('\n'),
  },
  {
    id: 'html-blockquote',
    description: 'HTML email with nested blockquote quoting old message',
    body:
      '<p>Thanks for getting back to me.</p>' +
      '<blockquote>' +
      '<p>Original message from alice@acme.com:</p>' +
      '<blockquote>' +
      '<p>Please use IBAN PL61109010140000071219812874 for payment.</p>' +
      '<p>Phone: +48 600 700 800</p>' +
      '</blockquote>' +
      '</blockquote>',
  },
  {
    id: 'mixed-pl-en',
    description: 'Bilingual PL/EN email with contacts and IDs',
    body: [
      'Hi team / Cześć zespole,',
      '',
      'Quick update on the client onboarding:',
      '- Contact: marketing@example.com',
      '- Kontakt PL: pl-support@example.pl, tel. 500 600 700',
      '- NIP: 1234567802',
      '- Zip/Postal: 00-950',
      '',
      'Thanks, Piotr',
    ].join('\n'),
  },
  {
    id: 'chained-replies',
    description: 'Deep reply chain — user text must survive, quotes must die',
    body: [
      'Yes, that works. Scheduled for Thursday 11am.',
      '',
      'On Wed, Alice wrote:',
      '> How about Thursday?',
      '>',
      '> On Tue, Bob wrote:',
      '>> Does Wednesday work?',
      '>>',
      '>> On Mon, Alice wrote:',
      '>>> Let us schedule a sync.',
      '>>> My PESEL is 44051401458.',
      '>>> Card for expenses: 5500 0000 0000 0004',
    ].join('\n'),
  },
  {
    id: 'duplicate-pii',
    description: 'Repeated email + phone (tests placeholder reuse)',
    body: [
      'Contact alice@acme.com if urgent.',
      'Otherwise alice@acme.com will reply within 24h.',
      'Fallback line: +48 600 700 800',
      'Emergency: +48 600 700 800 (same number).',
    ].join('\n'),
  },
  {
    id: 'iban-in-prose',
    description: 'IBAN embedded in natural-language prose',
    body:
      'Please transfer the full amount to our German account ' +
      'DE89370400440532013000 by end of week, with reference ACME-2026-001.',
  },
  {
    id: 'no-pii-baseline',
    description: 'Clean email with no PII at all — must pass re-scan trivially',
    body: [
      'Hi,',
      '',
      'Quick question about the project timeline — do you have bandwidth',
      'for a review next week? No rush, happy to push to the week after.',
      '',
      'Thanks',
    ].join('\n'),
  },
  {
    id: 'headers-as-body',
    description: 'Email where the user pasted raw headers into the body',
    body: [
      'FYI, the suspicious email had these headers:',
      'From: phisher@bad.example.com',
      'Received: from mail.bad.example.com by mx.victim.com',
      'Please block sender and notify admin@victim.com.',
    ].join('\n'),
  },
  {
    id: 'polish-signature-full',
    description: 'Email body plus a rich Polish signature block',
    body: [
      'Cześć,',
      '',
      'Wysyłam zaktualizowaną ofertę. Proszę o potwierdzenie do piątku.',
      '',
      '--',
      'Anna Wiśniewska',
      'Senior Account Manager',
      'ACME Sp. z o.o.',
      'ul. Marszałkowska 1, 00-123 Warszawa',
      'NIP: 1234567802',
      'tel. +48 22 555 66 77',
      'kom. 600 700 800',
      'anna.wisniewska@acme.pl',
      'https://acme.pl',
    ].join('\n'),
  },
  {
    id: 'pl-regon-dowod-plate',
    description: 'Polish business + vehicle + ID info (v2 regex categories)',
    body: [
      'Potwierdzenie rejestracji działalności.',
      '',
      'REGON: 123456785',
      'Dowód osobisty właściciela: ABC123458',
      'Numer rejestracyjny pojazdu: WA 12345',
      '',
      'Pozdrawiam,',
    ].join('\n'),
  },
];

/**
 * Fixtures for the GDPR Art. 9 sensitive-topic gate.
 *
 * Each fixture MUST trigger `detectSensitiveCategories` — the leak canary
 * asserts this to guard against the keyword list silently regressing.
 * None of these should reach the cloud AI layer in production: the gate
 * in `anonymizingCloud` hard-fails them before the pipeline runs.
 */
export const SENSITIVE_EMAIL_FIXTURES: SensitiveEmailFixture[] = [
  {
    id: 'health-pl-diagnosis',
    description: 'Polish health — mentions diagnosis and treatment',
    body: 'Dzień dobry, otrzymałem diagnozę cukrzycy. Proszę o receptę na leki.',
    expectedCategory: 'health',
  },
  {
    id: 'health-en-cancer',
    description: 'English health — cancer and hospital',
    body: 'The oncology team at the hospital confirmed the cancer diagnosis.',
    expectedCategory: 'health',
  },
  {
    id: 'religion-pl',
    description: 'Polish religion — church attendance',
    body: 'Spotkamy się przy kościele po niedzielnej modlitwie.',
    expectedCategory: 'religion',
  },
  {
    id: 'sexual-orientation-en',
    description: 'English sexual orientation — coming out',
    body: 'Thanks for the support when I came out as gay last year.',
    expectedCategory: 'sexual_orientation',
  },
  {
    id: 'political-pl',
    description: 'Polish political opinion — election results',
    body: 'Wyniki ostatnich wyborów były dla wszystkich zaskakujące.',
    expectedCategory: 'political_opinion',
  },
];
