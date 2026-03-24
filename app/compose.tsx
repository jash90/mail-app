import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useSearchContacts, useSendEmail } from '@/features/gmail/hooks';
import { generateEmail } from '@/features/ai/api';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/store/authStore';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';

const suggestionsListStyle = { maxHeight: 200 } as const;

export default function ComposeScreen() {
  const router = useRouter();
  const [to, setTo] = useState('');
  const [toName, setToName] = useState('');
  const [debouncedTo, setDebouncedTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTo(to), 300);
    return () => clearTimeout(timer);
  }, [to]);

  const { data: suggestions } = useSearchContacts(debouncedTo);
  const { mutate: send, isPending: sending } = useSendEmail(user?.id ?? '');

  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => generateAbortRef.current?.abort();
  }, []);

  const handleToChange = useCallback((text: string) => {
    setTo(text);
    setShowSuggestions(true);
  }, []);

  const generateWithAI = async () => {
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
  };

  const handleSend = () => {
    send(
      { to: [{ name: toName || null, email: to }], subject, body },
      {
        onSuccess: () => {
          analytics.emailSent();
          router.back();
        },
        onError: () => Alert.alert('Error', 'Failed to send email.'),
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
        onPress={() => {
          setTo(item.email);
          setToName(item.name ?? '');
          setShowSuggestions(false);
        }}
      >
        {item.name ? (
          <Text className="text-sm text-white">{item.name}</Text>
        ) : null}
        <Text className="text-sm text-zinc-400">{item.email}</Text>
      </Pressable>
    ),
    [],
  );

  const visibleSuggestions =
    showSuggestions && suggestions?.length ? suggestions : [];

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
            {visibleSuggestions.length > 0 && (
              <View className="absolute top-12 right-0 left-0 rounded-lg bg-zinc-900">
                <FlatList
                  data={visibleSuggestions.slice(0, 8)}
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
              onPress={generateWithAI}
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
