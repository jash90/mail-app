import { storeTokens } from '@/features/auth/oauthService';
import { useAuthStore } from '@/store/authStore';
import {
    GoogleSignin
} from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

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
                    expiry_time: Date.now() + 3600_000, // 1-hour Google default
                    user: userPayload,
                });

                setUser(userPayload);
                router.replace('/(tabs)/list');
            }
        } catch (error: any) {
            console.error(error)
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

            <TouchableOpacity
                className="w-full rounded-2xl bg-white p-4"
                onPress={signIn}
            >
                <Text className="text-center text-black">Continue with Gmail</Text>
            </TouchableOpacity>

            <View className="h-[60px] items-center justify-end">
                <Text className="text-center text-sm text-white">
                    By continuing, you agree to our{' '}
                    <Text className="text-white underline">Terms of Service</Text> and{' '}
                    <Text className="text-white underline">Privacy Policy</Text>
                </Text>
            </View>
        </StyledSafeAreaView>
    );
}
