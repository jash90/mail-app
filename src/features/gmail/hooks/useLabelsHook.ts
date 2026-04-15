import { useQuery } from '@tanstack/react-query';
import { gmailKeys } from '../services/queryKeys';
import { getLabels } from '../services/labels';

export const useLabels = (accountId: string) =>
  useQuery({
    queryKey: gmailKeys.labels(accountId),
    queryFn: () => getLabels(accountId),
    enabled: !!accountId,
  });
