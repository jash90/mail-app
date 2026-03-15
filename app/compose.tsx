import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useSearchContacts, useSendEmail } from '@/features/gmail/hooks';
import { generateEmail } from '@/features/ai/api';
import { useAuthStore } from '@/store/authStore';

const StyledSafeAreaView = withUniwind(SafeAreaView);

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

  const generateWithAI = async () => {
    if (!body.trim() && !subject.trim()) return;
    setGenerating(true);
    try {
      const result = await generateEmail(
        body || subject,
        subject,
        { email: to, name: toName },
        user,
      );
      setBody(result);
    } catch {
      Alert.alert('Error', 'Failed to generate email with AI.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = () => {
    send(
      { to: [{ name: toName || null, email: to }], subject, body },
      { onSuccess: () => router.back() },
    );
  };

  const handleCancel = () => {
    router.back();
  };

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

          <TouchableOpacity
            className="items-center justify-center rounded-2xl p-2"
            onPress={handleCancel}
          >
            <Icon name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>
        <View className="flex-1">
          <View style={{ zIndex: 10 }}>
            <TextInput
              className="mb-3 rounded-lg bg-zinc-900 p-3 text-base text-white"
              placeholder="To"
              placeholderTextColor="#888"
              value={to}
              onChangeText={(text) => {
                setTo(text);
                setShowSuggestions(true);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#2dd4bf"
            />
            {visibleSuggestions.length > 0 && (
              <View className="absolute top-12 right-0 left-0 rounded-lg bg-zinc-900">
                <FlatList
                  data={visibleSuggestions}
                  keyExtractor={(item, index) => `${item.email}-${index}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      className="border-b border-zinc-800 px-3 py-3"
                      onPress={() => {
                        setTo(item.email);
                        setToName(item.name);
                        setShowSuggestions(false);
                      }}
                    >
                      {item.name ? (
                        <Text className="text-sm text-white">{item.name}</Text>
                      ) : null}
                      <Text className="text-sm text-zinc-400">
                        {item.email}
                      </Text>
                    </TouchableOpacity>
                  )}
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
            <TouchableOpacity
              className="flex-row items-center rounded-lg px-3 py-1.5"
              onPress={generateWithAI}
              disabled={generating}
            >
              <Icon name="magic-wand" size={18} color="white" />
              <Text className="ml-2 font-semibold text-white">AI Reply</Text>
            </TouchableOpacity>
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
          <TouchableOpacity
            className="mt-4 flex-1 rounded-2xl bg-white p-4"
            onPress={handleSend}
            disabled={sending || !to}
            style={{ opacity: sending || !to ? 0.5 : 1 }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="black" />
            ) : (
              <Text className="text-center text-lg font-semibold text-black">
                Send
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </StyledSafeAreaView>
  );
}
