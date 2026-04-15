import { estimateTokens } from '@/src/features/ai/services/tokenTracker';

// recordTokenUsage is tested indirectly — it's a no-op when tracking is disabled
// and uses lazy require() to avoid pulling db in test context

describe('tokenTracker', () => {
  describe('estimateTokens', () => {
    it('estimates ~4 chars per token', () => {
      // 20 chars → 5 tokens
      expect(estimateTokens('abcdefghijklmnopqrst')).toBe(5);
    });

    it('rounds up for non-divisible lengths', () => {
      // 7 chars → ceil(7/4) = 2
      expect(estimateTokens('abcdefg')).toBe(2);
    });

    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('returns 1 for short strings', () => {
      expect(estimateTokens('hi')).toBe(1);
    });

    it('handles long text', () => {
      const text = 'a'.repeat(1000);
      expect(estimateTokens(text)).toBe(250);
    });
  });
});
