import { Pressable, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useEffect } from 'react';

interface ErrorScreenProps {
  error: Error;
  retry?: () => void;
}

/** Reusable error fallback screen with Sentry reporting. */
export default function ErrorScreen({ error, retry }: ErrorScreenProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <Text className="mb-2 text-lg font-semibold text-red-400">
        Something went wrong
      </Text>
      <Text className="mb-6 text-center text-sm text-gray-400">
        {error.message}
      </Text>
      {retry && (
        <Pressable onPress={retry} className="rounded-xl bg-white/10 px-6 py-3">
          <Text className="text-sm font-medium text-white">Try again</Text>
        </Pressable>
      )}
    </View>
  );
}
