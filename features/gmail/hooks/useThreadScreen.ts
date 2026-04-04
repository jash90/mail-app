import { generateReply } from '@/features/ai/api';
import { useMarkAsRead } from './useThreadMutations';
import { useSendReply } from './useSendHooks';
import { useThread, useThreadMessages } from './useThreadQueries';
import { recordAction } from '@/db/repositories/userActions';
import { analytics } from '@/lib/analytics';
import { parseCompositeId } from '@/lib/parseCompositeId';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

export function useThreadScreen(compositeId: string) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [webViewHeights, setWebViewHeights] = useState<Record<string, number>>(
    {},
  );
  const user = useAuthStore((s) => s.user);

  const { accountId, providerId: providerThreadId } = useMemo(
    () => parseCompositeId(compositeId),
    [compositeId],
  );

  const handleHeightChange = useCallback((msgId: string, height: number) => {
    setWebViewHeights((prev) => ({ ...prev, [msgId]: height }));
  }, []);

  const myEmail = user?.email?.toLowerCase();

  const {
    data: thread,
    isLoading: threadLoading,
    isError: threadError,
  } = useThread(accountId, providerThreadId);

  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
  } = useThreadMessages(accountId, providerThreadId);

  const isLoading = threadLoading || messagesLoading;
  const isError = threadError || messagesError;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    if (providerThreadId) {
      analytics.threadOpened(providerThreadId);
    }
  }, [providerThreadId]);

  const { mutate: reply, isPending: replying } = useSendReply(accountId);

  const handleReply = useCallback(() => {
    if (!messages?.length || !message.trim()) return;
    const lastMsg = messages[messages.length - 1];

    const allRecipients = [lastMsg.from, ...lastMsg.to, ...(lastMsg.cc ?? [])];
    const seen = new Set<string>();
    const toList = allRecipients.filter((p) => {
      const email = p.email.toLowerCase();
      if (email === myEmail || seen.has(email)) return false;
      seen.add(email);
      return true;
    });

    reply(
      {
        threadId: providerThreadId,
        messageId: lastMsg.provider_message_id,
        data: {
          from: { name: user?.name ?? '', email: user?.email ?? '' },
          to: toList,
          subject: `Re: ${thread?.subject ?? ''}`,
          body: message,
        },
      },
      {
        onSuccess: () => {
          analytics.replySent(providerThreadId);
          setMessage('');
        },
        onError: (error: unknown) => {
          Alert.alert(
            'Error',
            `Failed to send reply: ${error instanceof Error ? error.message : 'Please try again.'}`,
          );
        },
      },
    );
  }, [messages, message, myEmail, reply, providerThreadId, user, thread]);

  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => generateAbortRef.current?.abort();
  }, []);

  const handleAIReply = useCallback(async () => {
    if (!messages?.length) return;
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setGeneratingAI(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const { email, name } = lastMsg.from;
      const originalText = lastMsg.body.text || lastMsg.snippet;
      const result = await generateReply(
        originalText,
        message,
        thread?.subject,
        { email, name: name ?? '' },
        user,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMessage(result);
      analytics.aiReplyGenerated(providerThreadId);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('[ThreadScreen] AI reply generation failed:', err);
      Alert.alert('Error', 'Failed to generate AI reply.');
    } finally {
      if (!controller.signal.aborted) {
        setGeneratingAI(false);
      }
    }
  }, [messages, message, thread, user, providerThreadId]);

  const { mutateAsync: markAsRead } = useMarkAsRead(accountId);

  useEffect(() => {
    if (providerThreadId) {
      markAsRead(providerThreadId).catch(() => {});
      recordAction(accountId, providerThreadId, 'view');
    }
  }, [providerThreadId, markAsRead, accountId]);

  return {
    thread,
    messages,
    isLoading,
    isError,
    message,
    setMessage,
    generatingAI,
    replying,
    myEmail,
    webViewHeights,
    handleHeightChange,
    handleReply,
    handleAIReply,
    handleBack,
  };
}
