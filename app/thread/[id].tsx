import { generateReply } from '@/features/ai/api';
import { useMarkAsRead, useSendReply, useThread, useThreadMessages } from '@/features/gmail';
import { useAuthStore } from '@/store/authStore';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const heightScript = `
  (function() {
    function postHeight() {
      var h = document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(JSON.stringify({ height: h }));
    }
    postHeight();
    document.querySelectorAll('img').forEach(function(img) {
      img.addEventListener('load', postHeight);
      img.addEventListener('error', postHeight);
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(postHeight).observe(document.body);
    } else {
      setTimeout(postHeight, 500);
      setTimeout(postHeight, 1500);
    }
  })();
  true;
`;

function wrapHtml(html: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; color: #ffffff !important; background-color: #000000 !important; }
        html, body {
          background-color: #000000 !important;
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        a { color: #818cf8 !important; }
        img { max-width: 100%; height: auto; background-color: transparent !important; }
        pre { white-space: pre-wrap; }
        blockquote { border-left: 3px solid #4b5563; padding-left: 12px; margin: 8px 0; color: #9ca3af !important; }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `;
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [webViewHeights, setWebViewHeights] = useState<Record<string, number>>(
    {},
  );
  const user = useAuthStore((s) => s.user);

  const onWebViewMessage = useCallback(
    (msgId: string) => (event: WebViewMessageEvent) => {
      try {
        const { height } = JSON.parse(event.nativeEvent.data);
        setWebViewHeights((prev) => ({ ...prev, [msgId]: height }));
      } catch { }
    },
    [],
  );

  // id is "accountId_threadId" — split on first underscore
  const separatorIndex = id?.indexOf('_') ?? -1;
  const accountId = separatorIndex > 0 ? id!.slice(0, separatorIndex) : '';
  const providerThreadId = separatorIndex > 0 ? id!.slice(separatorIndex + 1) : '';

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
    const myEmail = user?.email?.toLowerCase();

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

      const { email, name } = lastMsg.from

      const originalText = lastMsg.body.text || lastMsg.snippet;
      const result = await generateReply(originalText, message, thread?.subject, { email, name: name ?? "" }, user);
      setMessage(result);
    } catch {
      Alert.alert('Error', 'Failed to generate AI reply.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const { mutateAsync } = useMarkAsRead(accountId);



  useEffect(() => {
    if (providerThreadId) {
      mutateAsync(providerThreadId);
    }
  }, [providerThreadId]);

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

      {/* Thread Messages */}
      <ScrollView
        className="flex-1 py-3 w-full"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {messages?.map((msg) => {
          const isMe =
            !!user?.email &&
            msg.from.email.toLowerCase() === user.email.toLowerCase();
          const htmlContent = msg.body.html
            ? msg.body.html
            : `<pre>${msg.body.text ?? ''}</pre>`;

          return (
            <View
              key={msg.id}
              className={`mb-5 ${isMe ? 'items-end' : 'items-start'
                } flex w-full max-w-full p-4`}
            >
              <View
                className={`rounded shadow-md w-full`}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <WebView
                  source={{ html: wrapHtml(htmlContent) }}
                  originWhitelist={['*']}
                  scrollEnabled={false}
                  injectedJavaScript={heightScript}
                  onMessage={onWebViewMessage(msg.id)}
                  style={{
                    height: webViewHeights[msg.id] ?? 100,
                    opacity: webViewHeights[msg.id] ? 1 : 0.5,
                    backgroundColor: 'transparent',
                    width: '100%',
                  }}
                />

              </View>
              <Text
                className={`mt-2 text-right text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'
                  }`}
              >
                {formatRelativeDate(msg.created_at)}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View className="absolute right-0 bottom-0 left-0 flex-row flex-1 justify-between bg-zinc-900 p-4">
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
