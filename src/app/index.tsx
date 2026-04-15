import {
  getStoredTokens,
  isTokenExpired,
} from '@/src/features/auth/services/oauthService';
import { useAuthStore } from '@/src/shared/store/authStore';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { StyledSafeAreaView } from '@/src/shared/components/StyledSafeAreaView';

export default function IndexScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tokens = await getStoredTokens('gmail');
        if (!mounted) return;
        if (tokens?.user?.id && !isTokenExpired(tokens)) {
          setUser(tokens.user);
          router.replace('/(tabs)/list');
        } else {
          router.replace('/login');
        }
      } catch {
        if (mounted) router.replace('/login');
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router and setUser are stable refs
  }, []);

  return (
    <StyledSafeAreaView className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator size="large" color="white" />
    </StyledSafeAreaView>
  );
}
