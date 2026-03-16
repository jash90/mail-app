import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { resetTokens } from '@/features/auth/oauthService';
import { clearTokenCache } from '@/features/gmail';
import { clearAllData } from '@/db/client';
import { queryClient } from '@/app/_layout';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';

export default function SettingsScreen() {
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  const handleLogout = () => {
    clearAllData();
    queryClient.clear();
    clearUser();
    clearTokenCache();
    resetTokens();
    router.replace('/');
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
      </ScrollView>

      <View className="p-4">
        <Pressable className="rounded-2xl bg-white p-4" onPress={handleLogout}>
          <Text className="text-center text-lg font-semibold text-black">
            Logout
          </Text>
        </Pressable>
      </View>
    </StyledSafeAreaView>
  );
}
