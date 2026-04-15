import { generateReply } from '@/src/features/ai';
import type { EmailContext } from '@/src/features/ai/types';
import { analytics } from '@/src/shared/services/analytics';
import type { EmailMessage } from '@/src/shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

interface UseAIReplyParams {
  messages: EmailMessage[] | undefined;
  currentDraft: string;
  threadSubject: string | undefined;
  user: EmailContext['user'];
  providerThreadId: string;
  onGenerated: (text: string) => void;
}

export function useAIReply({
  messages,
  currentDraft,
  threadSubject,
  user,
  providerThreadId,
  onGenerated,
}: UseAIReplyParams) {
  const [generatingAI, setGeneratingAI] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleAIReply = useCallback(async () => {
    if (!messages?.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingAI(true);
    try {
      const lastMsg = messages[messages.length - 1]!;
      const { email, name } = lastMsg.from;
      const originalText = lastMsg.body.text || lastMsg.snippet;
      const result = await generateReply(
        originalText,
        currentDraft,
        threadSubject,
        { email, name: name ?? '' },
        user,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      onGenerated(result);
      analytics.aiReplyGenerated(providerThreadId);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('[useAIReply] AI reply generation failed:', err);
      Alert.alert('Error', 'Failed to generate AI reply.');
    } finally {
      if (!controller.signal.aborted) {
        setGeneratingAI(false);
      }
    }
  }, [
    messages,
    currentDraft,
    threadSubject,
    user,
    providerThreadId,
    onGenerated,
  ]);

  return { generatingAI, handleAIReply };
}
