import {
  getSummaryCache,
  getSummaryCacheBatch,
  summarizeEmail,
} from '@/features/ai/api';
import { fixTextEncoding } from '@/features/gmail/helpers';
import type { EmailThread } from '@/types';
import { type AudioStatus, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTSService } from './TTSService';
import { detectLang } from './detectLang';

export interface TTSTrack {
  threadId: string;
  senderName: string;
  summarySnippet: string;
  fullSummary: string;
  lang: string;
}

export interface TTSQueueState {
  tracks: TTSTrack[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  pendingCount: number;
  summarizing: boolean;
}

function buildTrack(t: EmailThread, summary: string): TTSTrack {
  return {
    threadId: t.id,
    senderName: fixTextEncoding(
      t.participants[0]?.name ?? t.participants[0]?.email ?? 'Unknown',
    ),
    summarySnippet: summary.length > 80 ? summary.slice(0, 80) + '...' : summary,
    fullSummary: summary,
    lang: detectLang(summary),
  };
}

const MAX_THREADS = 20;

export function useEmailTTSQueue(unreadThreads: EmailThread[]) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TTSTrack[]>([]);
  const [summarizing, setSummarizing] = useState(false);

  const player = useAudioPlayer(null);

  const generationIdRef = useRef(0);
  const currentIndexRef = useRef(-1);
  currentIndexRef.current = currentIndex;

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

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

  // Fetch summaries (up to MAX_THREADS), build tracks incrementally
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
          // Re-check cache — prefetchSummaries may have filled it concurrently
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

  const playTrackAtRef = useRef<(index: number) => Promise<void>>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        const currentIdx = currentIndexRef.current;
        if (!status.didJustFinish || currentIdx < 0) return;

        currentIndexRef.current = -1;

        const nextIdx = currentIdx + 1;
        if (nextIdx < tracksRef.current.length) {
          advanceTimerRef.current = setTimeout(() => {
            advanceTimerRef.current = null;
            playTrackAtRef.current?.(nextIdx);
          }, 1000);
        } else {
          setCurrentIndex(-1);
          setIsPlaying(false);
          setIsLoading(false);
        }
      },
    );
    return () => sub.remove();
  }, [player]);

  // If the currently playing track disappears from the list, stop
  useEffect(() => {
    if (currentIndex < 0) return;
    if (!tracks[currentIndex]) {
      player.pause();
      setCurrentIndex(-1);
      setIsPlaying(false);
      setIsLoading(false);
    }
  }, [tracks, currentIndex, player]);

  const playTrackAt = useCallback(
    async (index: number) => {
      if (index < 0 || index >= tracksRef.current.length) {
        setCurrentIndex(-1);
        setIsPlaying(false);
        return;
      }

      const track = tracksRef.current[index];
      generationIdRef.current += 1;
      const myId = generationIdRef.current;

      setCurrentIndex(index);
      setIsLoading(true);
      setIsPlaying(false);
      setError(null);

      try {
        const filePath = await TTSService.shared().getOrGenerateEmailAudio(
          track.threadId,
          track.fullSummary,
          track.lang,
        );

        if (myId !== generationIdRef.current) return;

        player.replace({ uri: `file://${filePath}` });

        // Wait for the native player to finish loading the new source
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            sub.remove();
            reject(new Error('Player load timeout'));
          }, 10_000);
          const sub = player.addListener(
            'playbackStatusUpdate',
            (s: AudioStatus) => {
              if (s.isLoaded) {
                clearTimeout(timeout);
                sub.remove();
                resolve();
              }
            },
          );
        });

        if (myId !== generationIdRef.current) return;

        player.play();
        setIsPlaying(true);
        setIsLoading(false);
      } catch (err) {
        console.warn('[TTS] Error:', err);
        if (myId !== generationIdRef.current) return;
        setError(err instanceof Error ? err.message : 'TTS generation failed');
        setIsLoading(false);
        setIsPlaying(false);
      }
    },
    [player],
  );
  playTrackAtRef.current = playTrackAt;

  const play = useCallback(async () => {
    if (!tracksRef.current.length) return;
    const startIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : 0;
    await playTrackAt(startIndex);
  }, [playTrackAt]);

  const pause = useCallback(() => {
    player.pause();
    setIsPlaying(false);
  }, [player]);

  const resume = useCallback(() => {
    player.play();
    setIsPlaying(true);
  }, [player]);

  const stop = useCallback(() => {
    generationIdRef.current += 1;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    currentIndexRef.current = -1;
    player.pause();
    setCurrentIndex(-1);
    setIsPlaying(false);
    setIsLoading(false);
  }, [player]);

  const next = useCallback(async () => {
    if (!tracksRef.current.length) return;
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= tracksRef.current.length) {
      stop();
      return;
    }
    await playTrackAt(nextIndex);
  }, [playTrackAt, stop]);

  const prev = useCallback(async () => {
    if (!tracksRef.current.length) return;
    const prevIndex = currentIndexRef.current > 0 ? currentIndexRef.current - 1 : 0;
    await playTrackAt(prevIndex);
  }, [playTrackAt]);

  const state: TTSQueueState = useMemo(
    () => ({
      tracks,
      currentIndex,
      isPlaying,
      isLoading,
      error,
      pendingCount: Math.min(unreadThreads.length, MAX_THREADS) - tracks.length,
      summarizing,
    }),
    [tracks, currentIndex, isPlaying, isLoading, error, unreadThreads.length, summarizing],
  );

  return { state, play, pause, resume, stop, next, prev };
}
