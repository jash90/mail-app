import { AppState, type AppStateStatus } from 'react-native';
import { performIncrementalSync, performFullSync, syncNextPage } from './sync';
import { getSyncState, upsertSyncState } from '@/db/repositories/syncState';
import { rebuildFTSIndex } from '@/db/repositories/search';
import { queryClient } from '@/lib/queryClient';
import { gmailKeys } from './queryKeys';

const INCREMENTAL_SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const PAGE_SYNC_DELAY_MS = 1_500; // delay between page fetches to avoid rate limits
const MAX_PAGINATION_RETRIES = 2;

type SyncStatus = 'idle' | 'syncing' | 'paginating' | 'stopped';

let status: SyncStatus = 'stopped';
let accountId: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;
let pageSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let paginationRetries = 0;
let paginationSyncedTotal = 0;

/** Invalidate React Query caches + rebuild FTS. */
function invalidateCaches(rebuildFts = true) {
  if (!accountId) return;
  if (rebuildFts) {
    rebuildFTSIndex(accountId);
  }
  queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
  queryClient.invalidateQueries({
    queryKey: ['contact-importance', accountId],
  });
}

/** Run a single sync cycle: incremental (or full if first time), then paginate remaining pages. */
async function runSyncCycle(): Promise<void> {
  if (!accountId || status === 'syncing') return;

  // Allow incremental sync to run even during pagination
  const wasPaginating = status === 'paginating';
  status = 'syncing';

  try {
    const state = getSyncState(accountId);
    const result = state?.history_id
      ? await performIncrementalSync(accountId, state)
      : await performFullSync(accountId);

    upsertSyncState(accountId, result.new_sync_state);

    if (result.synced_threads > 0 || result.synced_messages > 0) {
      invalidateCaches();
    }

    // Start or resume pagination if there are more pages
    if (result.new_sync_state.next_page_token) {
      status = 'paginating';
      paginationRetries = 0;
      paginationSyncedTotal = 0;
      schedulePaginationStep();
    } else if (wasPaginating) {
      // Was paginating but sync cleared the token — done
      status = 'idle';
    } else {
      status = 'idle';
    }
  } catch (e) {
    console.warn('[SyncManager] Sync cycle failed:', e);
    status = wasPaginating ? 'paginating' : 'idle';
    // If was paginating, resume pagination
    if (wasPaginating) schedulePaginationStep();
  }
}

/** Fetch one page of older threads, then schedule next if more remain. */
async function paginationStep(): Promise<void> {
  if (!accountId || status !== 'paginating') return;

  try {
    const result = await syncNextPage(accountId);
    upsertSyncState(accountId, result.new_sync_state);
    paginationRetries = 0; // reset on success

    if (result.synced_threads > 0) {
      paginationSyncedTotal += result.synced_threads;
      // Invalidate query cache per page (for UI updates) but defer FTS rebuild
      invalidateCaches(false);
    }

    if (result.new_sync_state.next_page_token) {
      schedulePaginationStep();
    } else {
      // All pages fetched — rebuild FTS once at the end
      status = 'idle';
      invalidateCaches(true);
    }
  } catch (e) {
    paginationRetries++;
    if (paginationRetries <= MAX_PAGINATION_RETRIES) {
      console.warn(
        `[SyncManager] Pagination failed (retry ${paginationRetries}/${MAX_PAGINATION_RETRIES}):`,
        e,
      );
      // Retry with longer delay
      pageSyncTimeout = setTimeout(
        paginationStep,
        PAGE_SYNC_DELAY_MS * (paginationRetries + 1),
      );
    } else {
      console.warn(
        '[SyncManager] Pagination failed after retries, will resume on next sync cycle',
      );
      status = 'idle';
      // Rebuild FTS with whatever we have so far
      if (paginationSyncedTotal > 0) {
        invalidateCaches(true);
      }
    }
  }
}

function schedulePaginationStep() {
  pageSyncTimeout = setTimeout(paginationStep, PAGE_SYNC_DELAY_MS);
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === 'active') {
    startPeriodicSync();
    runSyncCycle();
  } else {
    stopPeriodicSync();
  }
}

function startPeriodicSync() {
  if (intervalId) return;
  intervalId = setInterval(runSyncCycle, INCREMENTAL_SYNC_INTERVAL_MS);
}

function stopPeriodicSync() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (pageSyncTimeout) {
    clearTimeout(pageSyncTimeout);
    pageSyncTimeout = null;
  }
}

/** Start the sync manager. Call once after authentication is confirmed. */
export function startSyncManager(id: string): void {
  if (accountId === id && status !== 'stopped') return;

  accountId = id;
  status = 'idle';
  paginationRetries = 0;
  paginationSyncedTotal = 0;

  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener(
    'change',
    handleAppStateChange,
  );

  startPeriodicSync();
  runSyncCycle();
}

/** Stop the sync manager. Call on logout. */
export function stopSyncManager(): void {
  status = 'stopped';
  accountId = null;
  paginationRetries = 0;
  paginationSyncedTotal = 0;
  stopPeriodicSync();
  appStateSubscription?.remove();
  appStateSubscription = null;
}

/** Trigger an immediate sync (e.g. pull-to-refresh). Returns when done. */
export async function triggerManualSync(): Promise<void> {
  if (status === 'syncing') return;
  await runSyncCycle();
}

/** Get current sync manager status. */
export function getSyncManagerStatus(): SyncStatus {
  return status;
}
