import type { EmailThread } from '@/src/shared/types';
import { useMemo } from 'react';
import type { TTSQueueState } from '../types';
import { useTTSPlayer } from './useTTSPlayer';
import { useTTSTracks, type TTSTracksDeps } from './useTTSTracks';

/**
 * Orchestrates TTS playback of unread email summaries.
 * Composes `useTTSTracks` (summary fetching) + `useTTSPlayer` (audio playback).
 *
 * Accepts injected dependencies for cross-feature DIP compliance.
 */
export function useEmailTTSQueue(
  unreadThreads: EmailThread[],
  deps: TTSTracksDeps,
) {
  const { tracks, summarizing, maxThreads } = useTTSTracks(unreadThreads, deps);
  const {
    currentIndex,
    isPlaying,
    isLoading,
    error,
    play,
    pause,
    resume,
    stop,
    next,
    prev,
  } = useTTSPlayer(tracks);

  const state: TTSQueueState = useMemo(
    () => ({
      tracks,
      currentIndex,
      isPlaying,
      isLoading,
      error,
      pendingCount: Math.min(unreadThreads.length, maxThreads) - tracks.length,
      summarizing,
    }),
    [
      tracks,
      currentIndex,
      isPlaying,
      isLoading,
      error,
      unreadThreads.length,
      maxThreads,
      summarizing,
    ],
  );

  return { state, play, pause, resume, stop, next, prev };
}
