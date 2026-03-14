import { generateReply } from '@/features/ai/api';
import { useMarkAsRead, useSendReply, useThread, useThreadMessages } from '@/features/gmail';
import { useStreamingResponse } from '@/features/ai/local/hooks';
import { getActiveProviderName } from '@/features/ai/providers';
import { parseCompositeId } from '@/lib/parseCompositeId';
import { useAuthStore } from '@/store/authStore';
import { ThreadMessageItem } from '@/components/ThreadMessageItem';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [webViewHeights, setWebViewHeights] = useState<Record<string, number>>({});
  const user = useAuthStore((s) => s.user);
  const { streamingResponse, isGenerating: localGenerating } = useStreamingResponse();
  const isStreamingLocal = generatingAI && localGenerating && getActiveProviderName() === 'local';

  const { accountId, providerId: providerThreadId } = useMemo(
    () => parseCompositeId(id),
    [id],
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

  const handleBack = () => {
    router.back();
  };

  const { mutate: reply, isPending: replying } = useSendReply(accountId);

  const handleReply = () => {
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
          subject: `Re: ${thread!.subject}`,
          body: message,
        },
      },
      {
        onSuccess: () => setMessage(''),
        onError: (error: any) => {
          Alert.alert('Error', `Failed to send reply: ${error?.message ?? 'Please try again.'}`);
        },
      },
    );
  };

  const handleAIReply = async () => {
    if (!messages?.length) return;
    setGeneratingAI(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const { email, name } = lastMsg.from;
      const originalText = lastMsg.body.text || lastMsg.snippet;
      const result = await generateReply(originalText, message, thread?.subject, { email, name: name ?? "" }, user);
      setMessage(result);
    } catch {
      Alert.alert('Error', 'Failed to generate AI reply.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const { mutateAsync: markAsRead } = useMarkAsRead(accountId);

  useEffect(() => {
    if (providerThreadId) {
      markAsRead(providerThreadId).catch(() => {});
    }
  }, [providerThreadId, markAsRead]);

  if (isLoading) {
    return (
      <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#818cf8" />
      </StyledSafeAreaView>
    );
  }

  if (isError || !thread) {
    return (
      <StyledSafeAreaView className="flex-1 items-center justify-center bg-black p-4">
        <Text className="mb-4 text-center text-lg text-red-400">
          Failed to load thread
        </Text>
        <TouchableOpacity onPress={handleBack}>
          <Text className="text-indigo-400">Go back</Text>
        </TouchableOpacity>
      </StyledSafeAreaView>
    );
  }

  return (
    <StyledSafeAreaView className="flex-1 bg-black">
      <View className="mb-4 flex-row items-center justify-between p-4">
        <Text
          className="flex-1 text-center text-3xl font-bold text-white"
          numberOfLines={1}
        >
          {thread.subject}
        </Text>

        <TouchableOpacity
          className="items-center justify-center rounded-2xl p-2"
          onPress={handleBack}
        >
          <Icon name="close" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 py-3 w-full"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {messages?.map((msg) => (
          <ThreadMessageItem
            key={msg.id}
            msg={msg}
            isMe={!!myEmail && msg.from.email.toLowerCase() === myEmail}
            height={webViewHeights[msg.id]}
            onHeightChange={handleHeightChange}
          />
        ))}
      </ScrollView>

      <View className="absolute right-0 bottom-0 left-0 flex-row flex-1 justify-between bg-zinc-900 p-4">
        {isStreamingLocal ? (
          <ScrollView className="mb-3 flex-1 rounded-lg p-3">
            <Text className="text-base text-white">
              {streamingResponse || '...'}
            </Text>
          </ScrollView>
        ) : (
          <TextInput
            className="mb-3 flex-1 rounded-lg p-3 text-base text-white"
            placeholder="Write your message"
            placeholderTextColor="#888"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={7}
            textAlignVertical="top"
            editable={!replying}
          />
        )}
        <View className="items-center justify-between gap-4">
          <TouchableOpacity
            className="items-center justify-center rounded-4xl bg-black p-4"
            onPress={handleReply}
            disabled={replying || !message.trim()}
            style={{ opacity: replying || !message.trim() ? 0.5 : 1 }}
          >
            {replying ? (
              <ActivityIndicator size={24} color="white" />
            ) : (
              <Icon name="paper-plane" size={24} color="white" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center justify-center rounded-4xl bg-black p-4"
            onPress={handleAIReply}
            disabled={generatingAI}
            style={{ opacity: generatingAI ? 0.5 : 1 }}
          >
            {generatingAI ? (
              <ActivityIndicator size={24} color="white" />
            ) : (
              <Icon name="magic-wand" size={24} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </StyledSafeAreaView>
  );
}
