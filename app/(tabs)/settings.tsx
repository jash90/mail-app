import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { useAuthStore } from '@/store/authStore';
import { resetTokens } from '@/features/auth/oauthService';
import { clearTokenCache } from '@/features/gmail';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function SettingsScreen() {
  const router = useRouter();

  const user = useAuthStore((s) => s.user);

  const clearUser = useAuthStore((s) => s.clearUser);

  const handleLogout = () => {
    clearUser();
    clearTokenCache();
    resetTokens();
    router.replace('/');
  };

  return (
    <StyledSafeAreaView className="flex-1 bg-black p-4" edges={['top']}>
      <Text className="pb-4 text-left text-3xl font-bold text-white">
        Settings
      </Text>

      <View className="flex-1">
        <Text className="text-base font-semibold text-white">
          Account Email
        </Text>
        <TextInput
          className="h-[60px] rounded-lg bg-zinc-900 p-3 text-base text-white"
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
