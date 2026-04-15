import { useQuery } from '@tanstack/react-query';
import { getContactImportanceMap } from '@/src/shared/db/repositories/stats';

const THIRTY_MINUTES = 30 * 60 * 1000;

/** Contact importance tiers (1-5) based on email exchange history. */
export const useContactImportance = (accountId: string, userEmail: string) =>
  useQuery({
    queryKey: ['contact-importance', accountId],
    queryFn: () => getContactImportanceMap(accountId, userEmail),
    enabled: !!accountId && !!userEmail,
    staleTime: THIRTY_MINUTES,
  });
