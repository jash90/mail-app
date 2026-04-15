import { useMarkAsRead } from './useThreadMutations';
import { useSendReply } from './useSendHooks';
import { useThread, useThreadMessages } from './useThreadQueries';
import { recordAction } from '@/src/shared/db/repositories/userActions';
import { analytics } from '@/src/shared/services/analytics';
import { parseCompositeId } from '@/src/shared/services/parseCompositeId';
import { useAuthStore } from '@/src/shared/store/authStore';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

export function useThreadDetail(compositeId: string) {
  const router = useRouter();
  const [message, setMessage] = useState('');
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
    const lastMsg = messages[messages.length - 1]!;

    const allRecipients = [
      lastMsg!.from,
      ...lastMsg!.to,
      ...(lastMsg!.cc ?? []),
    ];
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
        messageId: lastMsg!.provider_message_id,
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
    replying,
    myEmail,
    webViewHeights,
    handleHeightChange,
    handleReply,
    handleBack,
    accountId,
    providerThreadId,
    user,
  };
}
