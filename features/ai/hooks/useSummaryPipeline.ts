import {
  getLocalUnreadInboxCount,
  selectThreadsForSummary,
} from '@/db/repositories/threads';
import { getInboxUnreadCount } from '@/features/gmail/labels';
import { syncLabelThreads } from '@/features/gmail/sync';
import { getSummaryCache, summarizeEmail } from '@/features/ai/api';
import { getActiveProviderName } from '@/features/ai/providers';
import { releaseLocalProvider } from '@/features/ai/providers/local';
import { acquireAI } from '@/features/ai/resourceLock';
import { threadEvents } from '@/lib/threadEvents';
import type { EmailThread } from '@/types';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

const SUMMARY_LIMIT = 20;

export type PipelinePhase =
  | 'idle'
  | 'checking'
  | 'syncing'
  | 'selecting'
  | 'summarizing'
  | 'done'
  | 'error';

export interface SummaryItem {
  thread: EmailThread;
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useSummaryPipeline(accountId: string, userEmail: string) {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [processed, setProcessed] = useState(0);
  const [phase, setPhase] = useState<PipelinePhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState('');
  const [runId, bumpRunId] = useReducer((n: number) => n + 1, 0);
  const cancelledRef = useRef(false);
  const retryAbortMapRef = useRef(new Map<string, AbortController>());
  const aiLockReleaseRef = useRef<(() => void) | null>(null);
  const itemsRef = useRef<SummaryItem[]>([]);
  const phaseRef = useRef<PipelinePhase>('idle');
  const removedDuringRunRef = useRef(new Set<string>());

  // Keep refs in sync with state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const updatePhase = useCallback((p: PipelinePhase) => {
    setPhase(p);
    phaseRef.current = p;
  }, []);

  // Load a replacement thread when one is removed from the summary
  const loadReplacementThread = useCallback(async () => {
    if (!accountId || !userEmail) return;

    const currentIds = new Set(itemsRef.current.map((i) => i.thread.id));
    const freshThreads = selectThreadsForSummary(
      accountId,
      userEmail,
      SUMMARY_LIMIT,
    );
    const newThreads = freshThreads.filter((t) => !currentIds.has(t.id));

    const slotsAvailable = SUMMARY_LIMIT - itemsRef.current.length;
    const toAdd = newThreads.slice(0, Math.max(0, slotsAvailable));
    if (toAdd.length === 0) return;

    for (const thread of toAdd) {
      const cached = getSummaryCache(thread.id);
      setItems((prev) => [
        ...prev,
        { thread, summary: cached, loading: !cached, error: null },
      ]);

      if (cached) {
        setProcessed((p) => p + 1);
        continue;
      }

      try {
        const summary = await summarizeEmail(
          thread.id,
          thread.subject,
          thread.snippet,
        );
        setItems((prev) =>
          prev.map((i) =>
            i.thread.id === thread.id ? { ...i, summary, loading: false } : i,
          ),
        );
        setProcessed((p) => p + 1);
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.thread.id === thread.id
              ? {
                  ...i,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Unknown error',
                }
              : i,
          ),
        );
      }
    }
  }, [accountId, userEmail]);

  // Subscribe to thread removal events
  useEffect(() => {
    return threadEvents.onRemoved((threadId) => {
      if (!itemsRef.current.some((i) => i.thread.id === threadId)) return;

      setItems((prev) => {
        const removed = prev.find((i) => i.thread.id === threadId);
        if (removed?.summary) setProcessed((p) => Math.max(0, p - 1));
        return prev.filter((i) => i.thread.id !== threadId);
      });

      removedDuringRunRef.current.add(threadId);

      if (phaseRef.current === 'done') {
        loadReplacementThread();
      }
    });
  }, [loadReplacementThread]);

  // Main pipeline
  useEffect(() => {
    if (!accountId || !userEmail) return;
    cancelledRef.current = false;

    const abortController = new AbortController();

    const handle = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          // Phase 1: Check server vs local unread count
          updatePhase('checking');
          setPhaseDetail('Checking for new emails…');

          const localCount = getLocalUnreadInboxCount(accountId);
          let serverCount: number | null = null;
          try {
            serverCount = await getInboxUnreadCount();
          } catch {
            // API call failed — proceed with local data
          }
          if (cancelledRef.current) return;

          // Phase 2: Sync if counts don't match
          if (serverCount !== null && serverCount !== localCount) {
            updatePhase('syncing');
            const diff = serverCount - localCount;
            setPhaseDetail(
              diff > 0
                ? `Downloading ${diff} new email${diff !== 1 ? 's' : ''}…`
                : 'Syncing mailbox…',
            );
            try {
              await syncLabelThreads(accountId, ['INBOX']);
            } catch {
              // sync failed — proceed with local data
            }
            if (cancelledRef.current) return;
          }

          // Phase 3: Select top threads by tier
          updatePhase('selecting');
          setPhaseDetail('Selecting most important emails…');

          const threads = selectThreadsForSummary(
            accountId,
            userEmail,
            SUMMARY_LIMIT,
          );
          if (cancelledRef.current) return;

          if (threads.length === 0) {
            setItems([]);
            updatePhase('done');
            setPhaseDetail('');
            return;
          }

          // Phase 4: Build items with cached summaries, then generate missing ones
          const initialItems: SummaryItem[] = threads.map((thread) => {
            const cached = getSummaryCache(thread.id);
            return {
              thread,
              summary: cached,
              loading: !cached,
              error: null,
            };
          });

          const cachedCount = initialItems.filter((i) => i.summary).length;
          setItems(initialItems);
          setProcessed(cachedCount);

          if (cachedCount === threads.length) {
            updatePhase('done');
            setPhaseDetail('');
            return;
          }

          updatePhase('summarizing');
          setPhaseDetail(
            `Summarizing ${cachedCount + 1} of ${threads.length}…`,
          );

          // Acquire AI lock when using local provider to pause data fetching
          const isLocal = getActiveProviderName() === 'local';
          if (isLocal) {
            const release = await acquireAI(abortController.signal);
            aiLockReleaseRef.current = release;
          }

          try {
            for (let i = 0; i < threads.length; i++) {
              if (cancelledRef.current) break;
              if (initialItems[i].summary) continue;
              if (removedDuringRunRef.current.has(threads[i].id)) continue;

              setPhaseDetail(`Summarizing ${i + 1} of ${threads.length}…`);

              const t = threads[i];
              try {
                const summary = await summarizeEmail(
                  t.id,
                  t.subject,
                  t.snippet,
                  abortController.signal,
                );
                if (cancelledRef.current) break;
                setItems((prev) =>
                  prev.map((item) =>
                    item.thread.id === t.id
                      ? { ...item, summary, loading: false }
                      : item,
                  ),
                );
                setProcessed((prev) => prev + 1);
              } catch (err) {
                if (cancelledRef.current) break;
                console.warn(
                  `[SummaryPipeline] Failed to summarize thread ${t.id}`,
                );
                setItems((prev) =>
                  prev.map((item) =>
                    item.thread.id === t.id
                      ? {
                          ...item,
                          loading: false,
                          error:
                            err instanceof Error
                              ? err.message
                              : 'Unknown error',
                        }
                      : item,
                  ),
                );
              }
            }
          } finally {
            // Release AI lock and free model RAM
            if (aiLockReleaseRef.current) {
              aiLockReleaseRef.current();
              aiLockReleaseRef.current = null;
            }
            if (isLocal) {
              releaseLocalProvider().catch(() => {});
            }
          }

          if (!cancelledRef.current) {
            updatePhase('done');
            setPhaseDetail('');

            // Process any removals that occurred during summarizing
            if (removedDuringRunRef.current.size > 0) {
              removedDuringRunRef.current.clear();
              loadReplacementThread();
            }
          }
        } catch (err) {
          if (!cancelledRef.current) {
            updatePhase('error');
            setPhaseDetail(
              err instanceof Error ? err.message : 'Something went wrong',
            );
          }
        }
      })();
    });

    const retryAbortMap = retryAbortMapRef.current;
    return () => {
      cancelledRef.current = true;
      handle.cancel();
      abortController.abort();
      for (const ctrl of retryAbortMap.values()) ctrl.abort();
      retryAbortMap.clear();
      // Release AI lock if still held (e.g. component unmounted during inference)
      if (aiLockReleaseRef.current) {
        aiLockReleaseRef.current();
        aiLockReleaseRef.current = null;
      }
    };
  }, [accountId, userEmail, runId, updatePhase, loadReplacementThread]);

  const retrySummary = useCallback(
    async (_index: number, item: SummaryItem) => {
      const threadId = item.thread.id;

      setItems((prev) =>
        prev.map((i) =>
          i.thread.id === threadId ? { ...i, loading: true, error: null } : i,
        ),
      );

      const abort = new AbortController();
      retryAbortMapRef.current.set(threadId, abort);

      try {
        const summary = await summarizeEmail(
          item.thread.id,
          item.thread.subject,
          item.thread.snippet,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setItems((prev) =>
          prev.map((i) =>
            i.thread.id === threadId ? { ...i, summary, loading: false } : i,
          ),
        );
        setProcessed((prev) => prev + 1);
      } catch (err) {
        if (abort.signal.aborted) return;
        console.warn(
          `[SummaryPipeline] Retry failed for thread ${item.thread.id}`,
        );
        setItems((prev) =>
          prev.map((i) =>
            i.thread.id === threadId
              ? {
                  ...i,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Unknown error',
                }
              : i,
          ),
        );
      } finally {
        retryAbortMapRef.current.delete(threadId);
      }
    },
    [],
  );

  const restart = useCallback(() => {
    setItems([]);
    setProcessed(0);
    updatePhase('idle');
    setPhaseDetail('');
    removedDuringRunRef.current.clear();
    bumpRunId();
  }, [updatePhase]);

  const clearAll = useCallback(() => {
    setItems([]);
    setProcessed(0);
    updatePhase('idle');
    setPhaseDetail('');
  }, [updatePhase]);

  return {
    items,
    processed,
    total: items.length,
    phase,
    phaseDetail,
    retrySummary,
    restart,
    clearAll,
  };
}
