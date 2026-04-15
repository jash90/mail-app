import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';
import { LocalModelManager, TOKEN_TRACKING_ENABLED } from '@/src/features/ai';
import { PrivacySection } from '@/src/features/ai/anonymization/PrivacySection';
import { clearTokenCache } from '@/src/features/gmail';
import { TTSService } from '@/src/features/tts';
import { analytics } from '@/src/shared/services/analytics';
import { expoDb } from '@/src/shared/db/client';
import { queryClient } from '@/src/shared/services/queryClient';
import { Sentry } from '@/src/shared/services/sentry';
import {
  resetTokens,
  resetGoogleSignInConfig,
} from '@/src/features/auth/services/oauthService';
import { useAuthStore } from '@/src/shared/store/authStore';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import {
  Alert,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';

/** Destructive — clears all local database tables. Used only on logout/delete. */
function clearAllData() {
  try {
    expoDb.execSync('PRAGMA foreign_keys = OFF');
    expoDb.execSync(`
      BEGIN;
      DELETE FROM ai_token_usage;
      DELETE FROM summary_cache;
      DELETE FROM attachments;
      DELETE FROM message_recipients;
      DELETE FROM thread_labels;
      DELETE FROM thread_participants;
      DELETE FROM messages;
      DELETE FROM threads;
      DELETE FROM participants;
      DELETE FROM labels;
      DELETE FROM sync_state;
      COMMIT;
    `);
  } catch (error) {
    expoDb.execSync('ROLLBACK');
    throw error;
  } finally {
    expoDb.execSync('PRAGMA foreign_keys = ON');
  }
}

export default function SettingsScreen() {
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  const handleLogout = () => {
    Sentry.setUser(null);
    analytics.logout();
    clearAllData();
    queryClient.clear();
    clearUser();
    clearTokenCache();
    resetTokens();
    resetGoogleSignInConfig();
    router.replace('/');
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Usuń wszystkie dane',
      'Wszystkie lokalne dane (e-maile, podsumowania, modele TTS) zostaną usunięte i nastąpi wylogowanie. Czy kontynuować?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń i wyloguj',
          style: 'destructive',
          onPress: async () => {
            await TTSService.shared().clearCache();
            TTSService.shared().destroy();
            handleLogout();
          },
        },
      ],
    );
  };

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <ScrollView className="flex-1 p-4">
        <Text className="pb-4 text-left text-3xl font-bold text-white">
          Settings
        </Text>

        <Text className="text-base font-semibold text-white">
          Account Email
        </Text>
        <TextInput
          className="mb-6 h-[50px] rounded-lg bg-zinc-900 p-3 text-base text-white"
          value={user?.email ?? ''}
          editable={false}
        />

        <LocalModelManager />

        <PrivacySection />

        <View className="mt-6 gap-1">
          <Pressable
            className="flex-row items-center justify-between rounded-xl bg-zinc-900 px-4 py-3.5"
            onPress={() => router.push('/contact-tiers')}
          >
            <View className="flex-row items-center gap-3">
              <Icon name="people" size={18} color="#a1a1aa" />
              <Text className="text-base text-white">Contact Tiers</Text>
            </View>
            <Icon name="arrow-right" size={14} color="#52525b" />
          </Pressable>

          {TOKEN_TRACKING_ENABLED && (
            <Pressable
              className="flex-row items-center justify-between rounded-xl bg-zinc-900 px-4 py-3.5"
              onPress={() => router.push('/ai-tokens')}
            >
              <View className="flex-row items-center gap-3">
                <Icon name="energy" size={18} color="#a1a1aa" />
                <Text className="text-base text-white">AI Token Usage</Text>
              </View>
              <Icon name="arrow-right" size={14} color="#52525b" />
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View className="gap-3 p-4">
        <Pressable className="rounded-2xl bg-white p-4" onPress={handleLogout}>
          <Text className="text-center text-lg font-semibold text-black">
            Logout
          </Text>
        </Pressable>
        <Pressable
          className="rounded-2xl bg-red-600 p-4"
          onPress={handleDeleteAll}
        >
          <Text className="text-center text-lg font-semibold text-white">
            Usuń dane i wyloguj
          </Text>
        </Pressable>
      </View>
    </StyledSafeAreaView>
  );
}
