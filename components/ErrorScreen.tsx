import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import * as Sentry from '@sentry/react-native';
import { useEffect } from 'react';
import { isAppError, getErrorMessage } from '@/lib/errors';

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
  useEffect(() => {
    if (error) {
      Sentry.captureException(error);
    }
  }, [error]);

  const appError = error && isAppError(error) ? error : null;
  const isWarning = appError?.meta.severity === 'warning';
  const showRetry = retry && (appError ? appError.retryable : true);

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
        <Text
          className={`mb-2 text-lg font-semibold ${isWarning ? 'text-indigo-400' : 'text-red-400'}`}
        >
          Something went wrong
        </Text>
        <Text className="mb-6 text-center text-sm text-gray-400">
          {getErrorMessage(error)}
        </Text>
        {showRetry && (
          <Pressable
            onPress={retry}
            className="rounded-xl bg-white/10 px-6 py-3"
          >
            <Text className="text-sm font-medium text-white">Try again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
