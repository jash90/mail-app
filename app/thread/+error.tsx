import ErrorScreen from '@/components/ErrorScreen';

/** Error boundary for thread detail view. */
export default function ThreadError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return <ErrorScreen error={error} retry={retry} />;
}
