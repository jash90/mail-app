import { generateEmail } from '@/features/ai/api';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

export function useAICompose() {
  const [generating, setGenerating] = useState(false);
  const generateAbortRef = useRef<AbortController | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    return () => generateAbortRef.current?.abort();
  }, []);

  const generateWithAI = useCallback(
    async (
      body: string,
      subject: string,
      to: string,
      toName: string,
      setBody: (text: string) => void,
    ) => {
      if (!body.trim() && !subject.trim()) {
        Alert.alert(
          'Missing input',
          'Enter a subject or body for AI to work with.',
        );
        return;
      }
      if (!user) {
        Alert.alert('Error', 'You must be signed in to use AI generation.');
        return;
      }
      generateAbortRef.current?.abort();
      const controller = new AbortController();
      generateAbortRef.current = controller;
      setGenerating(true);
      try {
        const result = await generateEmail(
          body || subject,
          subject,
          { email: to, name: toName },
          user,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setBody(result);
        analytics.aiEmailGenerated();
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('[ComposeScreen] AI generation failed:', err);
        Alert.alert('Error', 'Failed to generate email with AI.');
      } finally {
        if (!controller.signal.aborted) {
          setGenerating(false);
        }
      }
    },
    [user],
  );

  return { generating, generateWithAI };
}
