import { getUnreadThreads } from '@/db/repositories/threads';
import { getContactImportanceMap } from '@/db/repositories/stats';
import { getSummaryCache, summarizeEmail } from '@/features/ai/api';
import type { EmailThread } from '@/types';
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SUMMARY_TIER = 4;

export interface SummaryItem {
  thread: EmailThread;
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useSummaryPipeline(accountId: string, userEmail: string) {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [processed, setProcessed] = useState(0);
  const cancelledRef = useRef(false);
  const retryAbortMapRef = useRef(new Map<number, AbortController>());

  useEffect(() => {
    if (!accountId || !userEmail) return;
    cancelledRef.current = false;
    const abortController = new AbortController();
    const allThreads = getUnreadThreads(accountId, 50);

    // Filter to only highest-tier contacts (tier >= MIN_SUMMARY_TIER)
    const importanceMap = getContactImportanceMap(accountId, userEmail);
    const threads = allThreads.filter((t) => {
      const email = t.participants[0]?.email?.toLowerCase() ?? '';
      const tier = importanceMap.get(email) ?? 1;
      return tier >= MIN_SUMMARY_TIER;
    });

    if (threads.length === 0) {
      setItems([]);
      return;
    }

    const initialItems: SummaryItem[] = threads.map((thread) => {
      const cached = getSummaryCache(thread.id);
      return {
        thread,
        summary: cached,
        loading: !cached,
        error: null,
      };
    });

    const cachedCount = initialItems.filter((item) => item.summary).length;
    setItems(initialItems);
    setProcessed(cachedCount);

    (async () => {
      for (let i = 0; i < threads.length; i++) {
        if (cancelledRef.current) break;
        if (initialItems[i].summary) continue;

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
          console.warn(`[SummaryPipeline] Failed to summarize thread ${t.id}`);
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
  }, []);

  return {
    items,
    processed,
    total: items.length,
    retrySummary,
    clearAll,
  };
}
