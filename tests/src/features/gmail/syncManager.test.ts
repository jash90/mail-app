import {
  startSyncManager,
  stopSyncManager,
  triggerManualSync,
  getSyncManagerStatus,
  setOnFtsRebuilt,
} from '@/src/features/gmail/services/syncManager';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockPerformIncrementalSync = jest.fn();
const mockPerformFullSync = jest.fn();
const mockSyncNextPage = jest.fn();

jest.mock('@/src/features/gmail/services/sync', () => ({
  performIncrementalSync: (...args: unknown[]) =>
    mockPerformIncrementalSync(...args),
  performFullSync: (...args: unknown[]) => mockPerformFullSync(...args),
  syncNextPage: (...args: unknown[]) => mockSyncNextPage(...args),
}));

const mockGetSyncState = jest.fn();
const mockUpsertSyncState = jest.fn();

jest.mock('@/src/shared/db/repositories/syncState', () => ({
  getSyncState: (...args: unknown[]) => mockGetSyncState(...args),
  upsertSyncState: (...args: unknown[]) => mockUpsertSyncState(...args),
}));

jest.mock('@/src/shared/db/repositories/search', () => ({
  rebuildFTSIndex: jest.fn(),
}));

jest.mock('@/src/features/search', () => ({
  resetFTSVerification: jest.fn(),
}));

const mockOnFtsRebuilt = jest.fn();

const mockInvalidateQueries = jest.fn();

jest.mock('@/src/shared/services/queryClient', () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

jest.mock('@/src/features/gmail/services/queryKeys', () => ({
  gmailKeys: {
    threads: (id: string) => ['threads', id],
  },
}));

// Mock AppState
let appStateCallback: ((state: string) => void) | null = null;
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(
      (_event: string, callback: (state: string) => void) => {
        appStateCallback = callback;
        return { remove: mockRemove };
      },
    ),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeSyncResult(overrides = {}) {
  return {
    success: true,
    synced_threads: 0,
    synced_messages: 0,
    errors: [],
    new_sync_state: {
      status: 'idle',
      history_id: 'h123',
      last_synced_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  appStateCallback = null;
  setOnFtsRebuilt(mockOnFtsRebuilt);
  stopSyncManager();
});

afterEach(() => {
  stopSyncManager();
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('SyncManager', () => {
  describe('startSyncManager', () => {
    it('sets status to idle and triggers initial sync', () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');

      expect(getSyncManagerStatus()).not.toBe('stopped');
    });

    it('performs full sync when no sync state exists', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');

      // Flush the async runSyncCycle
      await jest.advanceTimersByTimeAsync(0);

      expect(mockPerformFullSync).toHaveBeenCalledWith('acc1');
    });

    it('performs incremental sync when history_id exists', async () => {
      const state = {
        history_id: 'h100',
        last_synced_at: new Date().toISOString(),
      };
      mockGetSyncState.mockReturnValue(state);
      mockPerformIncrementalSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockPerformIncrementalSync).toHaveBeenCalledWith('acc1', state);
    });

    it('is idempotent — second call with same ID does nothing', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockPerformFullSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopSyncManager', () => {
    it('sets status to stopped', () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');
      stopSyncManager();

      expect(getSyncManagerStatus()).toBe('stopped');
    });
  });

  describe('periodic sync', () => {
    it('triggers sync every 2 minutes', async () => {
      mockGetSyncState.mockReturnValue({ history_id: 'h1' });
      mockPerformIncrementalSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);
      expect(mockPerformIncrementalSync).toHaveBeenCalledTimes(1);

      // Advance 2 minutes
      await jest.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(mockPerformIncrementalSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache invalidation', () => {
    it('invalidates caches when threads are synced', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(
        makeSyncResult({ synced_threads: 5 }),
      );

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockInvalidateQueries).toHaveBeenCalled();
    });

    it('does not invalidate caches when nothing synced', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(
        makeSyncResult({ synced_threads: 0, synced_messages: 0 }),
      );

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('starts pagination when next_page_token exists', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(
        makeSyncResult({
          synced_threads: 10,
          new_sync_state: {
            status: 'idle',
            history_id: 'h1',
            next_page_token: 'page2',
          },
        }),
      );
      mockSyncNextPage.mockResolvedValue(
        makeSyncResult({
          synced_threads: 5,
          new_sync_state: { status: 'idle', history_id: 'h1' },
        }),
      );

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(getSyncManagerStatus()).toBe('paginating');

      // Advance past PAGE_SYNC_DELAY_MS (1500ms)
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockSyncNextPage).toHaveBeenCalledWith('acc1');
    });
  });

  describe('AppState awareness', () => {
    it('registers AppState listener on start', () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');

      expect(appStateCallback).not.toBeNull();
    });
  });

  describe('triggerManualSync', () => {
    it('triggers immediate sync', async () => {
      mockGetSyncState.mockReturnValue({ history_id: 'h1' });
      mockPerformIncrementalSync.mockResolvedValue(makeSyncResult());

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      mockPerformIncrementalSync.mockClear();
      await triggerManualSync();

      expect(mockPerformIncrementalSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('error recovery', () => {
    it('recovers from sync failure and goes back to idle', async () => {
      mockGetSyncState.mockReturnValue(null);
      mockPerformFullSync.mockRejectedValueOnce(new Error('network error'));

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      // Should not crash — status goes back to idle
      expect(getSyncManagerStatus()).toBe('idle');
    });

    it('persists sync state on success', async () => {
      mockGetSyncState.mockReturnValue(null);
      const result = makeSyncResult();
      mockPerformFullSync.mockResolvedValue(result);

      startSyncManager('acc1');
      await jest.advanceTimersByTimeAsync(0);

      expect(mockUpsertSyncState).toHaveBeenCalledWith(
        'acc1',
        result.new_sync_state,
      );
    });
  });
});
