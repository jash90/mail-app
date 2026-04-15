import { useState, useEffect, useCallback, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  gmailKeys,
  gmailRequest,
  apiRequestRaw,
  parseMultipartResponseWithStatus,
  mapGmailThreadToEmailThread,
  extractStatMessage,
} from '@/src/features/gmail';
import { acquireNetwork } from '@/src/shared/services/resourceLock';
import { useAuthStore } from '@/src/shared/store/authStore';
import type { EmailStats, StatsProgress } from '../types';
import { computeStatsFromDb } from '@/src/shared/db/repositories/stats';
import { getThreadCount } from '@/src/shared/db/repositories/threads';
import { purgeOldStatMessages } from '@/src/shared/db/repositories/messages';
import { fetchAllMessages } from '../services/fetchAllMessages';
import type { StatsGmailDeps } from '../services/batchFetcher';

export function useEmailStats(accountId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Wire Gmail dependencies — the stats feature receives them here (app-level coordination)
  const gmailDeps: StatsGmailDeps = useRef({
    gmailRequest,
    apiRequestRaw,
    parseMultipartResponseWithStatus,
    mapGmailThreadToEmailThread,
    extractStatMessage,
  }).current;
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [fullStats, setFullStats] = useState<EmailStats | null>(null);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [progress, setProgress] = useState<StatsProgress>({
    phase: 'listing',
    loaded: 0,
    total: 0,
  });
  const fetchingRef = useRef(false);

  /** Compute stats from SQLite (instant — no API call). */
  const computeDbStats = useCallback(() => {
    const userEmail = user?.email ?? '';
    if (!accountId || !userEmail) return;

    // Only compute if there's data in SQLite
    const count = getThreadCount(accountId);
    if (count === 0) return;

    try {
      const dbStats = computeStatsFromDb(accountId, userEmail);
      setStats(dbStats);

      // If we have a decent amount of data, show it as full stats
      if (dbStats.messageCount > 0) {
        setFullStats(dbStats);
      }
    } catch (e) {
      console.warn('Failed to compute stats from DB:', e);
    }
  }, [accountId, user?.email]);

  const fetchFull = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoadingFull(true);
    setError(null);
    setProgress({ phase: 'listing', loaded: 0, total: 0 });

    const releaseNetwork = await acquireNetwork();
    try {
      const userEmail = user?.email ?? '';
      let batchCount = 0;
      const SNAPSHOT_INTERVAL = 10;

      const {
        threads,
        failedCount: failed,
        skippedCount,
        totalListedCount,
        cachedCount,
        purgedCount,
      } = await fetchAllMessages(
        accountId,
        gmailDeps,
        (p) => setProgress(p),
        () => {
          // Data is being written to SQLite in fetchBatch — just update snapshots periodically
          batchCount++;
          if (batchCount % SNAPSHOT_INTERVAL === 0) {
            try {
              const snapshot = computeStatsFromDb(accountId, userEmail);
              setStats(snapshot);
            } catch {
              /* */
            }
          }
        },
      );

      setFailedCount(failed);

      // Invalidate thread list cache if data changed (new fetches or purged stale threads)
      if (threads.length > 0 || purgedCount > 0) {
        queryClient.invalidateQueries({
          queryKey: gmailKeys.threads(accountId),
        });
      }

      // Always compute final stats from SQLite — even if everything was cached,
      // the DB has data and stats should reflect it
      const computed = computeStatsFromDb(accountId, userEmail);
      computed.failedThreadCount = failed;
      // totalListedThreads = how many threads the API says exist in INBOX (before any cache/skip filtering)
      computed.totalListedThreads = totalListedCount;

      // Don't mark as complete if threads were lost
      if (failed > 0) {
        computed.isComplete = false;
      }

      setFullStats(computed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load stats';
      console.error('Failed to compute full stats:', e);
      setError(msg);
    } finally {
      releaseNetwork();
      setIsLoadingFull(false);
      fetchingRef.current = false;
    }
  }, [accountId, user?.email, queryClient]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      computeDbStats();
    });
    return () => handle.cancel();
  }, [computeDbStats]);

  const refetch = useCallback(async () => {
    // Clean up legacy duplicate stat messages before re-fetching
    purgeOldStatMessages(accountId);
    computeDbStats();
    setFullStats(null);
    setError(null);
    await fetchFull();
  }, [accountId, computeDbStats, fetchFull]);

  return {
    stats,
    fullStats,
    isLoadingFull,
    progress,
    error,
    failedCount,
    refetch,
    fetchFull,
  };
}
