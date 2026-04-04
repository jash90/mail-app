import {
  getLocalUnreadInboxCount,
  selectThreadsForSummary,
} from '@/db/repositories/threads';
import { getInboxUnreadCount } from '@/features/gmail/labels';
import { syncLabelThreads } from '@/features/gmail/sync';
import { getSummaryCache, summarizeEmail } from '@/features/ai/api';
import type { EmailThread } from '@/types';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const cancelledRef = useRef(false);
  const retryAbortMapRef = useRef(new Map<number, AbortController>());

  useEffect(() => {
    if (!accountId || !userEmail) return;
    cancelledRef.current = false;
    const abortController = new AbortController();

    (async () => {
      try {
        // Phase 1: Check server vs local unread count
        setPhase('checking');
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
          setPhase('syncing');
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
        setPhase('selecting');
        setPhaseDetail('Selecting most important emails…');

        const threads = selectThreadsForSummary(
          accountId,
          userEmail,
          SUMMARY_LIMIT,
        );
        if (cancelledRef.current) return;

        if (threads.length === 0) {
          setItems([]);
          setPhase('done');
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
          setPhase('done');
          setPhaseDetail('');
          return;
        }

        setPhase('summarizing');
        setPhaseDetail(`Summarizing ${cachedCount + 1} of ${threads.length}…`);

        for (let i = 0; i < threads.length; i++) {
          if (cancelledRef.current) break;
          if (initialItems[i].summary) continue;

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
            setItems((prev) => {
              const updated = [...prev];
              updated[i] = { ...updated[i], summary, loading: false };
              return updated;
            });
            setProcessed((prev) => prev + 1);
          } catch (err) {
            if (cancelledRef.current) break;
            console.warn(
              `[SummaryPipeline] Failed to summarize thread ${t.id}`,
            );
            setItems((prev) => {
              const updated = [...prev];
              updated[i] = {
                ...updated[i],
                loading: false,
                error: err instanceof Error ? err.message : 'Unknown error',
              };
              return updated;
            });
          }
        }

        if (!cancelledRef.current) {
          setPhase('done');
          setPhaseDetail('');
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setPhase('error');
          setPhaseDetail(
            err instanceof Error ? err.message : 'Something went wrong',
          );
        }
      }
    })();

    const retryAbortMap = retryAbortMapRef.current;
    return () => {
      cancelledRef.current = true;
      abortController.abort();
      for (const ctrl of retryAbortMap.values()) ctrl.abort();
      retryAbortMap.clear();
    };
  }, [accountId, userEmail]);

  const retrySummary = useCallback(async (index: number, item: SummaryItem) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], loading: true, error: null };
      return updated;
    });

    const abort = new AbortController();
    retryAbortMapRef.current.set(index, abort);

    try {
      const summary = await summarizeEmail(
        item.thread.id,
        item.thread.subject,
        item.thread.snippet,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], summary, loading: false };
        return updated;
      });
      setProcessed((prev) => prev + 1);
    } catch (err) {
      if (abort.signal.aborted) return;
      console.warn(
        `[SummaryPipeline] Retry failed for thread ${item.thread.id}`,
      );
      setItems((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
        return updated;
      });
    } finally {
      retryAbortMapRef.current.delete(index);
    }
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setProcessed(0);
    setPhase('idle');
    setPhaseDetail('');
  }, []);

  return {
    items,
    processed,
    total: items.length,
    phase,
    phaseDetail,
    retrySummary,
    clearAll,
  };
}
