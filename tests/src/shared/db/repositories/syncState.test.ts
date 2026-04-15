jest.mock('@/src/shared/db/client', () => require('../mockClient'));

import {
  getSyncState,
  upsertSyncState,
} from '@/src/shared/db/repositories/syncState';
import { closeTestDb } from '../mockClient';

afterAll(() => closeTestDb());

describe('syncState repository', () => {
  const accountId = 'test-account-123';

  it('returns null for non-existent account', () => {
    expect(getSyncState('nonexistent')).toBeNull();
  });

  it('upserts and retrieves sync state', () => {
    upsertSyncState(accountId, {
      status: 'idle',
      history_id: 'hist_001',
      last_synced_at: '2026-01-01T00:00:00Z',
    });

    const state = getSyncState(accountId);
    expect(state).not.toBeNull();
    expect(state!.status).toBe('idle');
    expect(state!.history_id).toBe('hist_001');
    expect(state!.last_synced_at).toBe('2026-01-01T00:00:00Z');
    expect(state!.next_page_token).toBeUndefined();
  });

  it('updates existing sync state on conflict', () => {
    upsertSyncState(accountId, {
      status: 'syncing',
      history_id: 'hist_002',
      last_synced_at: '2026-02-01T00:00:00Z',
      next_page_token: 'page2',
    });

    const state = getSyncState(accountId);
    expect(state!.status).toBe('syncing');
    expect(state!.history_id).toBe('hist_002');
    expect(state!.next_page_token).toBe('page2');
  });

  it('clears optional fields when set to undefined', () => {
    upsertSyncState(accountId, {
      status: 'idle',
    });

    const state = getSyncState(accountId);
    expect(state!.status).toBe('idle');
    expect(state!.history_id).toBeUndefined();
    expect(state!.next_page_token).toBeUndefined();
  });
});
