import { formatRelativeDateFine } from '@/lib/formatDate';
import { wrapHtml, heightScript } from '@/lib/emailHtml';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

interface ThreadMessageItemProps {
  msg: {
    id: string;
    from: { email: string };
    body: { html?: string | null; text?: string | null };
    snippet: string;
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
      <Text
        className={`mt-2 text-right text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}
      >
        {formatRelativeDateFine(msg.created_at)}
      </Text>
    </View>
  );
});
