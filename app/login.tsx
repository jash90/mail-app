import { storeTokens, TOKEN_LIFETIME_MS } from '@/features/auth/oauthService';
import { analytics } from '@/lib/analytics';
import { Sentry } from '@/lib/sentry';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId:
        '510423566915-edi6sd1aqhcs4flbbcsdht22sfre9tsf.apps.googleusercontent.com', // iOS only
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/contacts.readonly',
      ],
    });
  }, []);

  const signIn = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const data = userInfo.data;
      if (data?.user) {
        const { accessToken } = await GoogleSignin.getTokens();
        const userPayload = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? '',
          givenName: data.user.givenName ?? '',
          familyName: data.user.familyName ?? '',
          photo: data.user.photo ?? null,
          idToken: data.idToken ?? null,
        };
        await storeTokens('gmail', {
          access_token: accessToken,
          refresh_token: '', // managed internally by the library
          expiry_time: Date.now() + TOKEN_LIFETIME_MS,
          user: userPayload,
        });

        setUser(userPayload);
        Sentry.setUser({ id: userPayload.id, email: userPayload.email });
        analytics.login(userPayload.id, userPayload.email);
        router.replace('/(tabs)/list');
      }
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
