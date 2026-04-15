import ErrorScreen from '@/src/shared/components/ErrorScreen';
import { useRouter } from 'expo-router';

/** Error boundary with close button that navigates back. For stack screens (thread, compose, etc). */
export function DismissableErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const router = useRouter();

  const handleDismiss = () => {
    try {
      router.back();
    } catch {
      retry();
    }
  };

  return <ErrorScreen error={error} retry={retry} onDismiss={handleDismiss} />;
}
