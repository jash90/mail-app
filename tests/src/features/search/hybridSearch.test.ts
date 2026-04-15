import {
  hybridSearch,
  resetFTSVerification,
} from '@/src/features/search/services/hybridSearch';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockSearchFTS = jest.fn();
const mockIsFTSIndexEmpty = jest.fn();
const mockRebuildFTSIndex = jest.fn();

jest.mock('@/src/shared/db/repositories/search', () => ({
  searchFTS: (...args: unknown[]) => mockSearchFTS(...args),
  isFTSIndexEmpty: () => mockIsFTSIndexEmpty(),
  rebuildFTSIndex: (...args: unknown[]) => mockRebuildFTSIndex(...args),
}));

const mockSearchThreadsWithFilters = jest.fn();

jest.mock('@/src/shared/db/repositories/threads', () => ({
  searchThreadsWithFilters: (...args: unknown[]) =>
    mockSearchThreadsWithFilters(...args),
}));

const mockRerankCandidates = jest.fn();

jest.mock('@/src/features/search/services/reranker', () => ({
  rerankCandidates: (...args: unknown[]) => mockRerankCandidates(...args),
}));

const mockSearchViaGmailApi = jest.fn();

jest.mock('@/src/features/gmail/services/searchApi', () => ({
  searchViaGmailApi: (...args: unknown[]) => mockSearchViaGmailApi(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeThread(id: string, email = 'user@test.com') {
  return {
    id,
    subject: `Subject ${id}`,
    snippet: `Snippet ${id}`,
    label_ids: ['INBOX'],
    participants: [{ email, name: 'User' }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFTSVerification();
  mockIsFTSIndexEmpty.mockReturnValue(false);
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('hybridSearch', () => {
  it('delegates to Gmail API when useGmailApi is true', async () => {
    const apiResults = [
      { thread: makeThread('t1'), ftsScore: 0, finalScore: 10 },
    ];
    mockSearchViaGmailApi.mockResolvedValue(apiResults);

    const results = await hybridSearch('acc1', {
      query: 'test',
      filters: {},
      useGmailApi: true,
    });

    expect(mockSearchViaGmailApi).toHaveBeenCalledWith('acc1', 'test', {});
    expect(results).toEqual(apiResults);
    expect(mockSearchFTS).not.toHaveBeenCalled();
  });

  it('rebuilds FTS index if empty (once)', async () => {
    mockIsFTSIndexEmpty.mockReturnValueOnce(true);
    mockSearchFTS.mockReturnValue([]);

    await hybridSearch('acc1', { query: 'test', filters: {} });

    expect(mockRebuildFTSIndex).toHaveBeenCalledWith('acc1');
  });

  it('does not rebuild FTS index on second call', async () => {
    mockIsFTSIndexEmpty.mockReturnValue(false);
    mockSearchFTS.mockReturnValue([]);

    await hybridSearch('acc1', { query: 'test1', filters: {} });
    await hybridSearch('acc1', { query: 'test2', filters: {} });

    expect(mockRebuildFTSIndex).not.toHaveBeenCalled();
  });

  it('returns empty array when FTS returns no results', async () => {
    mockSearchFTS.mockReturnValue([]);

    const results = await hybridSearch('acc1', {
      query: 'nothing',
      filters: {},
    });

    expect(results).toEqual([]);
    expect(mockSearchThreadsWithFilters).not.toHaveBeenCalled();
  });

  it('returns empty array when filters eliminate all results', async () => {
    mockSearchFTS.mockReturnValue([{ threadId: 't1', rank: -5 }]);
    mockSearchThreadsWithFilters.mockReturnValue([]);

    const results = await hybridSearch('acc1', {
      query: 'test',
      filters: { isUnread: true },
    });

    expect(results).toEqual([]);
  });

  it('returns results sorted by finalScore descending', async () => {
    // rank -10 is more relevant than -5 in BM25 (more negative = better)
    // AI score of 2 vs 9 should dominate (0.5 weight) over FTS (0.3 weight)
    mockSearchFTS.mockReturnValue([
      { threadId: 't1', rank: -10 },
      { threadId: 't2', rank: -5 },
    ]);
    mockSearchThreadsWithFilters.mockReturnValue([
      makeThread('t1'),
      makeThread('t2'),
    ]);
    mockRerankCandidates.mockResolvedValue(
      new Map([
        ['t1', 2], // low AI score
        ['t2', 10], // high AI score → should win
      ]),
    );

    const results = await hybridSearch('acc1', {
      query: 'meeting',
      filters: {},
      generateFn: jest.fn(), // enable AI reranking path
    });

    expect(results[0]!.thread.id).toBe('t2');
    expect(results[1]!.thread.id).toBe('t1');
    expect(results[0]!.finalScore).toBeGreaterThan(results[1]!.finalScore);
  });

  it('passes FTS candidate limit of 50 to searchFTS', async () => {
    mockSearchFTS.mockReturnValue([]);

    await hybridSearch('acc1', { query: 'test', filters: {} });

    expect(mockSearchFTS).toHaveBeenCalledWith('test', 50);
  });

  it('uses contact importance in final scoring', async () => {
    mockSearchFTS.mockReturnValue([
      { threadId: 't1', rank: -5 },
      { threadId: 't2', rank: -5 },
    ]);
    const vipThread = makeThread('t1', 'vip@company.com');
    const normalThread = makeThread('t2', 'nobody@random.com');
    mockSearchThreadsWithFilters.mockReturnValue([vipThread, normalThread]);
    mockRerankCandidates.mockResolvedValue(
      new Map([
        ['t1', 5],
        ['t2', 5],
      ]),
    );

    const importanceMap = new Map([
      ['vip@company.com', 5],
      ['nobody@random.com', 1],
    ]);

    const results = await hybridSearch('acc1', {
      query: 'test',
      filters: {},
      importanceMap,
      generateFn: jest.fn(), // enable AI reranking path
    });

    // VIP should score higher due to importance weight
    expect(results[0]!.thread.id).toBe('t1');
  });

  it('limits results to 20', async () => {
    const ftsResults = Array.from({ length: 30 }, (_, i) => ({
      threadId: `t${i}`,
      rank: -i,
    }));
    const threads = Array.from({ length: 30 }, (_, i) => makeThread(`t${i}`));
    mockSearchFTS.mockReturnValue(ftsResults);
    mockSearchThreadsWithFilters.mockReturnValue(threads);
    mockRerankCandidates.mockResolvedValue(new Map());

    const results = await hybridSearch('acc1', {
      query: 'test',
      filters: {},
      generateFn: jest.fn(), // enable AI reranking path
    });

    expect(results.length).toBeLessThanOrEqual(20);
  });
});
