import {
  anonymizeMessages,
  regexScan,
  detectRegex,
  detectSensitiveCategories,
} from '@/src/features/ai/anonymization';
import type { ChatMessage } from '@/src/features/ai/types';
import {
  PII_EMAIL_FIXTURES,
  SENSITIVE_EMAIL_FIXTURES,
} from '../../../../fixtures/pii-emails';

/**
 * Leak canary corpus test.
 *
 * For every fixture in `tests/fixtures/pii-emails.ts`, run the full
 * anonymization pipeline (strip + regex + role-tag seed — NER is stubbed
 * with `NONE` so this tests the regex layer's deterministic guarantee)
 * and assert that the post-pipeline re-scan returns **zero** structured
 * PII matches.
 *
 * This is the regression guard for the anonymization pipeline's core
 * security promise: structured identifiers (email, PESEL, NIP, IBAN,
 * PL phone, PL postal, credit card, URL tokens) are NEVER sent to the
 * cloud. Any failure here means the pipeline has a hole that a real
 * cloud AI call would exploit.
 */
describe('leak canary — structured PII must not survive the pipeline', () => {
  // Sanity guard: every fixture except the intentional baseline should
  // contain at least one piece of structured PII before anonymization.
  it('fixtures contain PII (sanity check)', () => {
    for (const fx of PII_EMAIL_FIXTURES) {
      if (fx.id === 'no-pii-baseline') {
        expect(detectRegex(fx.body)).toEqual([]);
        continue;
      }
      expect(detectRegex(fx.body).length).toBeGreaterThan(0);
    }
  });

  describe.each(PII_EMAIL_FIXTURES)('$id — $description', (fixture) => {
    it('post-pipeline re-scan returns no structured PII', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: fixture.body },
      ];

      // NER is stubbed as NONE — this test only proves the regex +
      // quote-strip layer is sufficient for structured PII, which is
      // the deterministic guarantee of the design.
      const runNerInference = jest.fn().mockResolvedValue('NONE');

      const { anonMessages } = await anonymizeMessages(messages, {
        runNerInference,
      });

      // System message passes through, but the user body must be clean.
      const userMessage = anonMessages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();

      const leaks = regexScan(userMessage!.content);
      if (leaks.length > 0) {
        const details = leaks.map((l) => `${l.type}: ${l.value}`).join(', ');
        throw new Error(
          `Fixture "${fixture.id}" leaked ${leaks.length} PII match(es) after pipeline: ${details}\n\nOutput:\n${userMessage!.content}`,
        );
      }
      expect(leaks).toEqual([]);
    });

    // Regression guard for the keyword list: existing PII fixtures must
    // NOT trigger the sensitive-topic gate. If one does, either the list
    // has a new false-positive or the fixture itself changed.
    it('does NOT trigger the sensitive-topic gate (false-positive guard)', () => {
      const categories = detectSensitiveCategories(fixture.body);
      expect(categories).toEqual([]);
    });
  });
});

// ─── Sensitive-topic fixtures ───────────────────────────────────────────

describe('sensitive-topic canary — Art. 9 fixtures MUST be flagged', () => {
  describe.each(SENSITIVE_EMAIL_FIXTURES)('$id — $description', (fixture) => {
    it(`triggers the ${fixture.expectedCategory} category`, () => {
      const categories = detectSensitiveCategories(fixture.body);
      if (!categories.includes(fixture.expectedCategory as never)) {
        throw new Error(
          `Fixture "${fixture.id}" did NOT trigger expected category "${fixture.expectedCategory}". Detected: [${categories.join(', ')}]\n\nBody:\n${fixture.body}`,
        );
      }
      expect(categories).toContain(fixture.expectedCategory);
    });
  });
});
