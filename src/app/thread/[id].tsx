import { useAIReply } from '@/src/features/ai/hooks/useAIReply';
import { useThreadDetail } from '@/src/features/gmail/hooks/useThreadDetail';
import { ThreadMessageItem } from '@/src/features/gmail/components/ThreadMessageItem';
import { DismissableErrorBoundary } from '@/src/shared/components/DismissableErrorBoundary';
import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

export { DismissableErrorBoundary as ErrorBoundary };

const scrollContentStyle = { paddingBottom: 120 } as const;

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useThreadDetail(id);

  const onGenerated = useCallback(
    (text: string) => detail.setMessage(text),
    [detail.setMessage],
  );

  const { generatingAI, handleAIReply } = useAIReply({
    messages: detail.messages,
    currentDraft: detail.message,
    threadSubject: detail.thread?.subject,
    user: detail.user,
    providerThreadId: detail.providerThreadId,
    onGenerated,
  });

  const {
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
  } = detail;

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
        <Pressable onPress={handleBack}>
          <Text className="text-indigo-400">Go back</Text>
        </Pressable>
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

        <Pressable
          className="items-center justify-center rounded-2xl p-2"
          onPress={handleBack}
        >
          <Icon name="close" size={24} color="white" />
        </Pressable>
      </View>

      <ScrollView
        className="w-full flex-1 py-3"
        contentContainerStyle={scrollContentStyle}
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

      <View className="absolute right-0 bottom-0 left-0 flex-1 flex-row justify-between bg-zinc-900 p-4">
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
          <Pressable
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
          </Pressable>
          <Pressable
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
          </Pressable>
        </View>
      </View>
    </StyledSafeAreaView>
  );
}
