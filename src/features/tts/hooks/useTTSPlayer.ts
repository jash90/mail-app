import { type AudioStatus, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TTSService } from '../services/TTSService';
import type { TTSTrack } from '../types';

/**
 * Manages audio playback of TTS tracks: play, pause, resume, stop, next, prev.
 * Handles auto-advance, generation IDs for cancellation, and player lifecycle.
 */
export function useTTSPlayer(tracks: TTSTrack[]) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useAudioPlayer(null);

  const generationIdRef = useRef(0);
  const currentIndexRef = useRef(-1);
  currentIndexRef.current = currentIndex;

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const playTrackAtRef = useRef<(index: number) => Promise<void>>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance to next track when current finishes
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

      const track = tracksRef.current[index]!;
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
    const startIndex =
      currentIndexRef.current >= 0 ? currentIndexRef.current : 0;
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
    const prevIndex =
      currentIndexRef.current > 0 ? currentIndexRef.current - 1 : 0;
    await playTrackAt(prevIndex);
  }, [playTrackAt]);

  return {
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
  };
}
