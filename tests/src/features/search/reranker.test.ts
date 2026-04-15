import { rerankCandidates } from '@/src/features/search/services/reranker';
import type { SearchResult } from '@/src/features/search/types';

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

// ── Tests ─────────────────────────────────────────────────────────────

describe('rerankCandidates', () => {
  it('returns empty map for empty candidates', async () => {
    const mockGenerate = jest.fn();
    const result = await rerankCandidates('test', [], mockGenerate);
    expect(result.size).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('parses valid AI score response', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('[9, 3, 7]');

    const candidates = [
      makeResult('t1', 'Meeting notes'),
      makeResult('t2', 'Newsletter'),
      makeResult('t3', 'Project update'),
    ];

    const scores = await rerankCandidates('meeting', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(9);
    expect(scores.get('t2')).toBe(3);
    expect(scores.get('t3')).toBe(7);
  });

  it('handles markdown-wrapped JSON response', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('```json\n[8, 5]\n```');

    const candidates = [
      makeResult('t1', 'Report'),
      makeResult('t2', 'Invoice'),
    ];

    const scores = await rerankCandidates('report', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(8);
    expect(scores.get('t2')).toBe(5);
  });

  it('falls back to score 5 when AI returns invalid JSON', async () => {
    const mockGenerate = jest
      .fn()
      .mockResolvedValue('I cannot help with that.');

    const candidates = [makeResult('t1', 'Test')];

    const scores = await rerankCandidates('query', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(5);
  });

  it('falls back to score 5 on AI provider error', async () => {
    const mockGenerate = jest.fn().mockRejectedValue(new Error('API error'));

    const candidates = [
      makeResult('t1', 'Important'),
      makeResult('t2', 'Spam'),
    ];

    const scores = await rerankCandidates('query', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(5);
    expect(scores.get('t2')).toBe(5);
  });

  it('clamps scores to 0-10 range', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('[15, 0, 7]');

    const candidates = [
      makeResult('t1', 'A'),
      makeResult('t2', 'B'),
      makeResult('t3', 'C'),
    ];

    const scores = await rerankCandidates('query', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(10);
    expect(scores.get('t2')).toBe(0); // clamped to min 0
    expect(scores.get('t3')).toBe(7);
  });

  it('limits candidates to MAX_CANDIDATES (15)', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeResult(`t${i}`, `Thread ${i}`),
    );
    const expectedScores = Array(15).fill(5);
    const mockGenerate = jest
      .fn()
      .mockResolvedValue(JSON.stringify(expectedScores));

    const scores = await rerankCandidates('query', many, mockGenerate);

    // Only first 15 scored
    expect(scores.size).toBe(15);
    expect(scores.has('t15')).toBe(false);
  });

  it('includes contact importance tier in prompt', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('[8]');

    const candidates = [makeResult('t1', 'VIP mail', 'vip@company.com')];
    const importanceMap = new Map([['vip@company.com', 5]]);

    await rerankCandidates(
      'important',
      candidates,
      mockGenerate,
      importanceMap,
    );

    const prompt = mockGenerate.mock.calls[0][0][1].content;
    expect(prompt).toContain('tier 5/5');
  });

  it('defaults to tier 1 for unknown senders', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('[5]');

    const candidates = [makeResult('t1', 'Unknown', 'unknown@random.com')];

    await rerankCandidates('query', candidates, mockGenerate);

    const prompt = mockGenerate.mock.calls[0][0][1].content;
    expect(prompt).toContain('tier 1/5');
  });

  it('fills missing scores with 5', async () => {
    const mockGenerate = jest.fn().mockResolvedValue('[9]');

    const candidates = [
      makeResult('t1', 'A'),
      makeResult('t2', 'B'),
      makeResult('t3', 'C'),
    ];

    const scores = await rerankCandidates('query', candidates, mockGenerate);

    expect(scores.get('t1')).toBe(9);
    expect(scores.get('t2')).toBe(5); // fallback
    expect(scores.get('t3')).toBe(5); // fallback
  });
});
