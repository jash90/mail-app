import { rerankCandidates } from '@/features/search/reranker';
import type { SearchResult } from '@/features/search/types';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockGenerate = jest.fn();

jest.mock('@/features/ai/providers', () => ({
  getProvider: () => ({
    name: 'cloud',
    generate: (...args: unknown[]) => mockGenerate(...args),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeResult(
  id: string,
  subject: string,
  email = 'sender@example.com',
): SearchResult {
  return {
    thread: {
      id,
      subject,
      snippet: `Snippet for ${subject}`,
      label_ids: ['INBOX'],
      participants: [{ email, name: 'Sender' }],
    } as SearchResult['thread'],
    ftsScore: -1,
    finalScore: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('rerankCandidates', () => {
  it('returns empty map for empty candidates', async () => {
    const result = await rerankCandidates('test', []);
    expect(result.size).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('parses valid AI score response', async () => {
    mockGenerate.mockResolvedValue('[9, 3, 7]');

    const candidates = [
      makeResult('t1', 'Meeting notes'),
      makeResult('t2', 'Newsletter'),
      makeResult('t3', 'Project update'),
    ];

    const scores = await rerankCandidates('meeting', candidates);

    expect(scores.get('t1')).toBe(9);
    expect(scores.get('t2')).toBe(3);
    expect(scores.get('t3')).toBe(7);
  });

  it('handles markdown-wrapped JSON response', async () => {
    mockGenerate.mockResolvedValue('```json\n[8, 5]\n```');

    const candidates = [
      makeResult('t1', 'Report'),
      makeResult('t2', 'Invoice'),
    ];

    const scores = await rerankCandidates('report', candidates);

    expect(scores.get('t1')).toBe(8);
    expect(scores.get('t2')).toBe(5);
  });

  it('falls back to score 5 when AI returns invalid JSON', async () => {
    mockGenerate.mockResolvedValue('I cannot help with that.');

    const candidates = [makeResult('t1', 'Test')];

    const scores = await rerankCandidates('query', candidates);

    expect(scores.get('t1')).toBe(5);
  });

  it('falls back to score 5 on AI provider error', async () => {
    mockGenerate.mockRejectedValue(new Error('API error'));

    const candidates = [
      makeResult('t1', 'Important'),
      makeResult('t2', 'Spam'),
    ];

    const scores = await rerankCandidates('query', candidates);

    expect(scores.get('t1')).toBe(5);
    expect(scores.get('t2')).toBe(5);
  });

  it('clamps scores to 0-10 range', async () => {
    // The regex in parseScores only matches [\d\s,.]+, so negative numbers
    // won't match. Use values the parser can handle: out-of-range positives.
    mockGenerate.mockResolvedValue('[15, 0, 7]');

    const candidates = [
      makeResult('t1', 'A'),
      makeResult('t2', 'B'),
      makeResult('t3', 'C'),
    ];

    const scores = await rerankCandidates('query', candidates);

    expect(scores.get('t1')).toBe(10);
    expect(scores.get('t2')).toBe(0); // clamped to min 0
    expect(scores.get('t3')).toBe(7);
  });

  it('limits candidates to MAX_CANDIDATES (15)', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeResult(`t${i}`, `Thread ${i}`),
    );
    const expectedScores = Array(15).fill(5);
    mockGenerate.mockResolvedValue(JSON.stringify(expectedScores));

    const scores = await rerankCandidates('query', many);

    // Only first 15 scored
    expect(scores.size).toBe(15);
    expect(scores.has('t15')).toBe(false);
  });

  it('includes contact importance tier in prompt', async () => {
    mockGenerate.mockResolvedValue('[8]');

    const candidates = [makeResult('t1', 'VIP mail', 'vip@company.com')];
    const importanceMap = new Map([['vip@company.com', 5]]);

    await rerankCandidates('important', candidates, importanceMap);

    const prompt = mockGenerate.mock.calls[0][0][1].content;
    expect(prompt).toContain('tier 5/5');
  });

  it('defaults to tier 1 for unknown senders', async () => {
    mockGenerate.mockResolvedValue('[5]');

    const candidates = [makeResult('t1', 'Unknown', 'unknown@random.com')];

    await rerankCandidates('query', candidates);

    const prompt = mockGenerate.mock.calls[0][0][1].content;
    expect(prompt).toContain('tier 1/5');
  });

  it('fills missing scores with 5', async () => {
    // AI returns fewer scores than candidates
    mockGenerate.mockResolvedValue('[9]');

    const candidates = [
      makeResult('t1', 'A'),
      makeResult('t2', 'B'),
      makeResult('t3', 'C'),
    ];

    const scores = await rerankCandidates('query', candidates);

    expect(scores.get('t1')).toBe(9);
    expect(scores.get('t2')).toBe(5); // fallback
    expect(scores.get('t3')).toBe(5); // fallback
  });
});
