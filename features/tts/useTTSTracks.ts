import {
  getSummaryCache,
  getSummaryCacheBatch,
  summarizeEmail,
} from '@/features/ai/api';
import { fixTextEncoding } from '@/features/gmail/helpers';
import type { EmailThread } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { detectLang } from './detectLang';
import type { TTSTrack } from './types';

function buildTrack(t: EmailThread, summary: string): TTSTrack {
  return {
    threadId: t.id,
    senderName: fixTextEncoding(
      t.participants[0]?.name ?? t.participants[0]?.email ?? 'Unknown',
    ),
    summarySnippet:
      summary.length > 80 ? summary.slice(0, 80) + '...' : summary,
    fullSummary: summary,
    lang: detectLang(summary),
  };
}

const MAX_THREADS = 20;

/**
 * Fetches AI summaries for unread threads and builds TTS tracks incrementally.
 * Uses summary cache first, then generates missing summaries one by one.
 */
export function useTTSTracks(unreadThreads: EmailThread[]) {
  const [tracks, setTracks] = useState<TTSTrack[]>([]);
  const [summarizing, setSummarizing] = useState(false);

  const unreadThreadsRef = useRef(unreadThreads);
  unreadThreadsRef.current = unreadThreads;

  // Stable key so effect doesn't restart on every React Query refetch
  const threadKey = useMemo(
    () =>
      unreadThreads
        .slice(0, MAX_THREADS)
        .map((t) => t.id)
        .join(','),
    [unreadThreads],
  );

  useEffect(() => {
    const capped = unreadThreadsRef.current.slice(0, MAX_THREADS);
    if (!capped.length) {
      setTracks([]);
      setSummarizing(false);
      return;
    }

    const abort = new AbortController();

    // Seed from cache synchronously
    const cached = getSummaryCacheBatch(capped.map((t) => t.id));
    const initial: TTSTrack[] = [];
    for (const t of capped) {
      const text = cached.get(t.id);
      if (text) initial.push(buildTrack(t, text));
    }
    setTracks(initial);

    const missing = capped.filter((t) => !cached.has(t.id));
    if (!missing.length) {
      setSummarizing(false);
      return;
    }

    setSummarizing(true);

    (async () => {
      for (const t of missing) {
        if (abort.signal.aborted) return;
        try {
          const fresh = getSummaryCache(t.id);
          if (fresh) {
            setTracks((prev) => [...prev, buildTrack(t, fresh)]);
            continue;
          }
          const summary = await summarizeEmail(
            t.id,
            t.subject,
            t.snippet,
            abort.signal,
          );
          if (abort.signal.aborted) return;
          setTracks((prev) => [...prev, buildTrack(t, summary)]);
        } catch (err) {
          if (abort.signal.aborted) return;
          console.warn(`[TTS] Summary failed for ${t.id}:`, err);
        }
      }
      if (!abort.signal.aborted) setSummarizing(false);
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  return { tracks, summarizing, maxThreads: MAX_THREADS };
}
