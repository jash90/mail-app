import ErrorScreen from '@/components/ErrorScreen';

/** Global error boundary for all routes (Expo Router convention). */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return <ErrorScreen error={error} retry={retry} />;
}
