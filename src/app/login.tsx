import {
  storeTokens,
  TOKEN_LIFETIME_MS,
  signInWithGoogle,
} from '@/src/features/auth/services/oauthService';
import { analytics } from '@/src/shared/services/analytics';
import { Sentry } from '@/src/shared/services/sentry';
import { useAuthStore } from '@/src/shared/store/authStore';
import { useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const signIn = async () => {
    try {
      const { user, accessToken } = await signInWithGoogle();
      await storeTokens('gmail', {
        access_token: accessToken,
        refresh_token: '', // managed internally by the library
        expiry_time: Date.now() + TOKEN_LIFETIME_MS,
        user,
      });

      setUser(user);
      Sentry.setUser({ id: user.id, email: user.email });
      analytics.login(user.id, user.email);
      router.replace('/(tabs)/list');
    } catch (error: unknown) {
      console.error(error);
      Alert.alert(
        'Sign In Failed',
        error instanceof Error ? error.message : 'Something went wrong.',
      );
    }
  };

  return (
    <StyledSafeAreaView className="flex-1 justify-end bg-black p-4">
      <View className="flex-1 items-center justify-center">
        <Text className="pb-2 text-center text-4xl font-bold text-white">
          AI Mail
        </Text>

        <Text className="pb-2 text-center text-lg font-light text-white">
          Simple. Smart. Mail.
        </Text>
      </View>

      <Pressable className="w-full rounded-2xl bg-white p-4" onPress={signIn}>
        <Text className="text-center text-black">Continue with Gmail</Text>
      </Pressable>

      <View className="h-[60px] items-center justify-end">
        <Text className="text-center text-sm text-white">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </StyledSafeAreaView>
  );
}
