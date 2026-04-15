import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useSendEmail, useContactAutocomplete } from '@/src/features/gmail';
import { useAICompose } from '@/src/features/ai';
import { analytics } from '@/src/shared/services/analytics';
import { useAuthStore } from '@/src/shared/store/authStore';
import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import { DismissableErrorBoundary } from '@/src/shared/components/DismissableErrorBoundary';

export { DismissableErrorBoundary as ErrorBoundary };

const suggestionsListStyle = { maxHeight: 200 } as const;

export default function ComposeScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const user = useAuthStore((s) => s.user);

  const { to, toName, suggestions, handleToChange, selectContact } =
    useContactAutocomplete();
  const { generating, generateWithAI } = useAICompose();
  const { mutate: send, isPending: sending } = useSendEmail(user?.id ?? '');

  const handleGenerateAI = () => {
    generateWithAI(body, subject, to, toName, setBody);
  };

  const handleSend = () => {
    send(
      { to: [{ name: toName || null, email: to }], subject, body },
      {
        onSuccess: () => {
          analytics.emailSent();
          router.back();
        },
        onError: () =>
          import('react-native').then(({ Alert }) =>
            Alert.alert('Error', 'Failed to send email.'),
          ),
      },
    );
  };

  const handleCancel = () => {
    router.back();
  };

  const renderSuggestion = useCallback(
    ({ item }: { item: NonNullable<typeof suggestions>[number] }) => (
      <Pressable
        className="border-b border-zinc-800 px-3 py-3"
        onPress={() => selectContact(item.email, item.name ?? '')}
      >
        {item.name ? (
          <Text className="text-sm text-white">{item.name}</Text>
        ) : null}
        <Text className="text-sm text-zinc-400">{item.email}</Text>
      </Pressable>
    ),
    [selectContact],
  );

  return (
    <StyledSafeAreaView className="g-4 flex-1 bg-black p-4">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-center text-3xl font-bold text-white">
            Compose
          </Text>

          <Pressable
            className="items-center justify-center rounded-2xl p-2"
            onPress={handleCancel}
          >
            <Icon name="close" size={24} color="white" />
          </Pressable>
        </View>
        <View className="flex-1">
          <View style={{ zIndex: 10 }}>
            <TextInput
              className="mb-3 rounded-lg bg-zinc-900 p-3 text-base text-white"
              placeholder="To"
              placeholderTextColor="#888"
              value={to}
              onChangeText={handleToChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#2dd4bf"
            />
            {suggestions.length > 0 && (
              <View className="absolute top-12 right-0 left-0 rounded-lg bg-zinc-900">
                <FlashList
                  data={suggestions.slice(0, 8)}
                  keyExtractor={(item, index) => `${item.email}-${index}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={renderSuggestion}
                  style={suggestionsListStyle}
                />
              </View>
            )}
          </View>
          <TextInput
            className="mb-3 rounded-lg bg-zinc-900 p-3 text-base text-white"
            placeholder="Subject"
            placeholderTextColor="#888"
            value={subject}
            onChangeText={setSubject}
            selectionColor="#2dd4bf"
          />
          <View className="mb-2 flex-row items-center">
            <Pressable
              className="flex-row items-center rounded-lg px-3 py-1.5"
              onPress={handleGenerateAI}
              disabled={generating}
            >
              <Icon name="magic-wand" size={18} color="white" />
              <Text className="ml-2 font-semibold text-white">AI Reply</Text>
            </Pressable>
            {generating && (
              <ActivityIndicator size="small" color="white" className="ml-2" />
            )}
          </View>
          <TextInput
            className="h-110 rounded-lg bg-zinc-900 p-3 text-base text-white"
            placeholder="Write your message, or write text and AI will improve it"
            placeholderTextColor="#888"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            selectionColor="#2dd4bf"
          />
        </View>
        <View className="flex-row justify-between gap-4">
          <Pressable
            className="mt-4 flex-1 rounded-2xl bg-white p-4"
            onPress={handleSend}
            disabled={sending || !to || !user?.id}
            style={{ opacity: sending || !to || !user?.id ? 0.5 : 1 }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="black" />
            ) : (
              <Text className="text-center text-lg font-semibold text-black">
                Send
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </StyledSafeAreaView>
  );
}
