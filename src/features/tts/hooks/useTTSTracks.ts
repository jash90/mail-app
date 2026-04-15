import type { EmailThread } from '@/src/shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { detectLang } from '../services/detectLang';
import type { TTSTrack } from '../types';

/** Function signatures for injected dependencies — avoids cross-feature imports. */
export interface TTSTracksDeps {
  fixTextEncoding: (text: string) => string;
  getSummaryCache: (key: string) => string | null;
  getSummaryCacheBatch: (keys: string[]) => Map<string, string>;
  summarizeEmail: (
    threadId: string,
    subject: string,
    snippet: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}

function buildTrack(
  t: EmailThread,
  summary: string,
  fixTextEncoding: TTSTracksDeps['fixTextEncoding'],
): TTSTrack {
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
 *
 * All cross-feature dependencies are injected via `deps` to satisfy DIP.
 */
export function useTTSTracks(
  unreadThreads: EmailThread[],
  deps: TTSTracksDeps,
) {
  const [tracks, setTracks] = useState<TTSTrack[]>([]);
  const [summarizing, setSummarizing] = useState(false);

  const unreadThreadsRef = useRef(unreadThreads);
  unreadThreadsRef.current = unreadThreads;

  // Stable ref so effect doesn't restart when deps object is recreated
  const depsRef = useRef(deps);
  depsRef.current = deps;

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
    const d = depsRef.current;
    const capped = unreadThreadsRef.current.slice(0, MAX_THREADS);
    if (!capped.length) {
      setTracks([]);
      setSummarizing(false);
      return;
    }

    const abort = new AbortController();

    // Seed from cache synchronously
    const cached = d.getSummaryCacheBatch(capped.map((t) => t.id));
    const initial: TTSTrack[] = [];
    for (const t of capped) {
      const text = cached.get(t.id);
      if (text) initial.push(buildTrack(t, text, d.fixTextEncoding));
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
          const fresh = d.getSummaryCache(t.id);
          if (fresh) {
            setTracks((prev) => [
              ...prev,
              buildTrack(t, fresh, d.fixTextEncoding),
            ]);
            continue;
          }
          const summary = await d.summarizeEmail(
            t.id,
            t.subject,
            t.snippet,
            abort.signal,
          );
          if (abort.signal.aborted) return;
          setTracks((prev) => [
            ...prev,
            buildTrack(t, summary, d.fixTextEncoding),
          ]);
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
