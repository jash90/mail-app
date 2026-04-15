import { searchViaGmailApi } from '@/src/features/gmail/services/searchApi';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockGmailRequest = jest.fn();

jest.mock('@/src/features/gmail/services/api', () => ({
  gmailRequest: (...args: unknown[]) => mockGmailRequest(...args),
}));

jest.mock('@/src/features/gmail/threads', () => ({
  mapGmailThreadToEmailThread: jest.fn(
    (_accountId: string, thread: { id: string }) => ({
      id: thread.id,
      subject: `Subject ${thread.id}`,
      snippet: 'snippet',
      label_ids: ['INBOX'],
      participants: [{ email: 'test@test.com', name: 'Test' }],
    }),
  ),
}));

jest.mock('@/src/shared/db/repositories/labels', () => ({
  getLabels: jest.fn(() => [
    { id: 'Label_1', name: 'Work' },
    { id: 'Label_2', name: 'Personal Projects' },
  ]),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('searchViaGmailApi', () => {
  it('returns empty array for short queries (< 3 chars)', async () => {
    const results = await searchViaGmailApi('acc1', 'ab');
    expect(results).toEqual([]);
    expect(mockGmailRequest).not.toHaveBeenCalled();
  });

  it('returns empty array for empty query', async () => {
    const results = await searchViaGmailApi('acc1', '');
    expect(results).toEqual([]);
  });

  it('fetches threads from Gmail API and maps them', async () => {
    mockGmailRequest
      .mockResolvedValueOnce({ threads: [{ id: 't1' }, { id: 't2' }] })
      .mockResolvedValueOnce({ id: 't1', messages: [] })
      .mockResolvedValueOnce({ id: 't2', messages: [] });

    const results = await searchViaGmailApi('acc1', 'meeting notes');

    expect(results).toHaveLength(2);
    expect(results[0]!.thread.id).toBe('t1');
    expect(results[1]!.thread.id).toBe('t2');
  });

  it('assigns descending finalScore based on position', async () => {
    mockGmailRequest
      .mockResolvedValueOnce({
        threads: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
      })
      .mockResolvedValue({ id: 'tx', messages: [] });

    const results = await searchViaGmailApi('acc1', 'project update');

    expect(results[0]!.finalScore).toBeGreaterThan(results[1]!.finalScore);
    expect(results[1]!.finalScore).toBeGreaterThan(results[2]!.finalScore);
  });

  it('returns empty array when API returns no threads', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: undefined });

    const results = await searchViaGmailApi('acc1', 'nonexistent query');
    expect(results).toEqual([]);
  });

  it('skips individual thread fetch failures', async () => {
    mockGmailRequest
      .mockResolvedValueOnce({ threads: [{ id: 't1' }, { id: 't2' }] })
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ id: 't2', messages: [] });

    const results = await searchViaGmailApi('acc1', 'test query');

    expect(results).toHaveLength(1);
    expect(results[0]!.thread.id).toBe('t2');
  });

  it('returns empty array on complete API failure', async () => {
    mockGmailRequest.mockRejectedValueOnce(new Error('network error'));

    const results = await searchViaGmailApi('acc1', 'test query');
    expect(results).toEqual([]);
  });

  it('applies isUnread filter to Gmail query', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: [] });

    await searchViaGmailApi('acc1', 'test', { isUnread: true });

    const url = mockGmailRequest.mock.calls[0][0] as string;
    expect(url).toContain('is%3Aunread');
  });

  it('applies isStarred filter to Gmail query', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: [] });

    await searchViaGmailApi('acc1', 'test', { isStarred: true });

    const url = mockGmailRequest.mock.calls[0][0] as string;
    expect(url).toContain('is%3Astarred');
  });

  it('applies timeRange filter to Gmail query', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: [] });

    await searchViaGmailApi('acc1', 'test', { timeRange: 'week' });

    const url = mockGmailRequest.mock.calls[0][0] as string;
    expect(url).toContain('newer_than%3A7d');
  });

  it('resolves label IDs to names in Gmail query', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: [] });

    await searchViaGmailApi('acc1', 'test', { labelIds: ['Label_1'] });

    const url = mockGmailRequest.mock.calls[0][0] as string;
    expect(url).toContain('label%3AWork');
  });

  it('wraps label names with spaces in quotes', async () => {
    mockGmailRequest.mockResolvedValueOnce({ threads: [] });

    await searchViaGmailApi('acc1', 'test', { labelIds: ['Label_2'] });

    const url = mockGmailRequest.mock.calls[0][0] as string;
    // "Personal Projects" → label:"Personal Projects"
    expect(url).toContain('label%3A%22Personal+Projects%22');
  });
});
