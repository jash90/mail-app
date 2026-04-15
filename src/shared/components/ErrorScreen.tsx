import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import * as Sentry from '@sentry/react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { isAppError, getErrorMessage } from '@/src/shared/services/errors';

interface ErrorScreenProps {
  error?: Error;
  retry?: () => void;
  onDismiss?: () => void;
}

/** Reusable error fallback screen with Sentry reporting. */
export default function ErrorScreen({
  error,
  retry,
  onDismiss,
}: ErrorScreenProps) {
  const router = useRouter();

  useEffect(() => {
    if (error) {
      Sentry.captureException(error);
    }
  }, [error]);

  const appError = error && isAppError(error) ? error : null;
  const isWarning = appError?.meta.severity === 'warning';
  const showRetry = retry && (appError ? appError.retryable : true);

  const iconName = isWarning ? 'info' : 'exclamation';
  const accentColor = isWarning ? '#818cf8' : '#f87171';

  const handleGoHome = () => {
    try {
      router.replace('/(tabs)/list');
    } catch {
      // Navigation may not be available at root level — retry is the only option
      retry?.();
    }
  };

  return (
    <View className="flex-1 bg-black">
      {onDismiss && (
        <SafeAreaView edges={['top']}>
          <View className="flex-row justify-end px-4 pt-2">
            <Pressable
              onPress={onDismiss}
              className="items-center justify-center rounded-2xl p-2"
            >
              <Icon name="close" size={24} color="white" />
            </Pressable>
          </View>
        </SafeAreaView>
      )}
      <View className="flex-1 items-center justify-center px-6">
        <View
          className="mb-5 items-center justify-center rounded-full p-4"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <Icon name={iconName} size={32} color={accentColor} />
        </View>

        <Text
          className={`mb-2 text-lg font-semibold ${isWarning ? 'text-indigo-400' : 'text-red-400'}`}
        >
          {isWarning ? 'Something needs attention' : 'Something went wrong'}
        </Text>

        <Text className="mb-8 text-center text-sm leading-5 text-zinc-400">
          {getErrorMessage(error)}
        </Text>

        <View className="w-full gap-3">
          {showRetry && (
            <Pressable
              onPress={retry}
              className="w-full items-center rounded-xl bg-white/10 py-3.5"
            >
              <Text className="text-sm font-medium text-white">Try again</Text>
            </Pressable>
          )}

          {!onDismiss && (
            <Pressable
              onPress={handleGoHome}
              className="w-full items-center rounded-xl py-3"
            >
              <Text className="text-sm text-zinc-500">Go to Inbox</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
