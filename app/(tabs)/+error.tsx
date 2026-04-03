import ErrorScreen from '@/components/ErrorScreen';

/** Error boundary for tab screens (Inbox, Stats, Settings). */
export default function TabsError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return <ErrorScreen error={error} retry={retry} />;
}
