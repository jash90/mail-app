import { formatRelativeDateFine } from '@/src/shared/services/formatDate';
import { wrapHtml, heightScript } from '@/src/shared/services/emailHtml';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

interface ThreadMessageItemProps {
  msg: {
    id: string;
    from: { email: string };
    body: { html?: string | null; text?: string | null };
    snippet: string;
    is_newsletter?: boolean;
    is_auto_reply?: boolean;
    created_at: string;
  };
  isMe: boolean;
  height: number | undefined;
  onHeightChange: (msgId: string, height: number) => void;
}

export const ThreadMessageItem = memo(function ThreadMessageItem({
  msg,
  isMe,
  height,
  onHeightChange,
}: ThreadMessageItemProps) {
  const htmlContent = msg.body.html ?? `<pre>${msg.body.text ?? ''}</pre>`;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const { height: h } = JSON.parse(event.nativeEvent.data);
        onHeightChange(msg.id, h);
      } catch (e) {
        console.warn(
          '[ThreadMessageItem] Failed to parse WebView height message:',
          e,
        );
      }
    },
    [msg.id, onHeightChange],
  );

  return (
    <View
      className={`mb-5 ${isMe ? 'items-end' : 'items-start'} flex w-full max-w-full p-4`}
    >
      <View
        className="w-full rounded shadow-md"
        style={{ alignSelf: isMe ? 'flex-end' : 'flex-start' }}
      >
        <WebView
          source={{ html: wrapHtml(htmlContent) }}
          originWhitelist={['*']}
          scrollEnabled={false}
          injectedJavaScript={heightScript}
          onMessage={handleMessage}
          style={{
            height: height ?? 100,
            opacity: height ? 1 : 0.5,
            backgroundColor: 'transparent',
            width: '100%',
          }}
        />
      </View>
      <View className="mt-2 flex-row items-center justify-end gap-1.5">
        {msg.is_newsletter && (
          <View className="rounded bg-indigo-900/60 px-1.5 py-0.5">
            <Text className="text-[9px] font-semibold text-indigo-300">
              Newsletter
            </Text>
          </View>
        )}
        {msg.is_auto_reply && (
          <View className="rounded bg-amber-900/60 px-1.5 py-0.5">
            <Text className="text-[9px] font-semibold text-amber-300">
              Auto-reply
            </Text>
          </View>
        )}
        <Text
          className={`text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}
        >
          {formatRelativeDateFine(msg.created_at)}
        </Text>
      </View>
    </View>
  );
});
