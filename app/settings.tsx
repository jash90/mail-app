import React from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Switch,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useAuthStore } from '@/store/authStore';
import { resetTokens } from '@/features/auth/oauthService';
import { clearTokenCache } from '@/features/gmail';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function SettingsScreen() {
    const router = useRouter();

    const user = useAuthStore((s) => s.user);

    const clearUser = useAuthStore((s) => s.clearUser);

    const handleBack = () => {
        router.back();
    };

    const handleLogout = () => {
        clearUser();
        clearTokenCache();
        resetTokens();
        router.dismissAll();
        router.replace('/');
    };

    return (
        <StyledSafeAreaView className="flex-1 bg-black p-4">
            <View className="flex-row items-center justify-between">
                <Text className="pb-4 text-left text-3xl font-bold text-white">
                    Settings
                </Text>
                <TouchableOpacity
                    className="items-center justify-center rounded-2xl p-2"
                    onPress={handleBack}
                >
                    <Icon name="close" size={24} color="white" />
                </TouchableOpacity>
            </View>

            <View className="flex-1">
                <Text className="text-base font-semibold text-white">
                    Account Email
                </Text>
                <TextInput
                    className="h-[60px] text-base rounded-lg bg-zinc-900 p-3 text-white"
                    value={user?.email ?? ''}
                    editable={false}
                />
            </View>

            <TouchableOpacity
                className="mt-4 rounded-2xl bg-white p-4"
                onPress={handleLogout}
            >
                <Text className="text-center text-lg font-semibold text-black">
                    Logout
                </Text>
            </TouchableOpacity>
        </StyledSafeAreaView>
    );
}

