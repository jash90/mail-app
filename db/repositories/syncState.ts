import { eq } from 'drizzle-orm';
import { db } from '../client';
import { syncState } from '../schema';
import type { SyncState } from '@/types';

export function getSyncState(accountId: string): SyncState | null {
  const row = db
    .select()
    .from(syncState)
    .where(eq(syncState.accountId, accountId))
    .get();
  if (!row) return null;
  return {
    status: row.status,
    history_id: row.historyId ?? undefined,
    last_synced_at: row.lastSyncedAt ?? undefined,
    next_page_token: row.nextPageToken ?? undefined,
  };
}

export function upsertSyncState(accountId: string, state: SyncState): void {
  db.insert(syncState)
    .values({
      accountId,
      historyId: state.history_id ?? null,
      lastSyncedAt: state.last_synced_at ?? null,
      nextPageToken: state.next_page_token ?? null,
      status: state.status,
    })
    .onConflictDoUpdate({
      target: syncState.accountId,
      set: {
        historyId: state.history_id ?? null,
        lastSyncedAt: state.last_synced_at ?? null,
        nextPageToken: state.next_page_token ?? null,
        status: state.status,
      },
    })
    .run();
}
