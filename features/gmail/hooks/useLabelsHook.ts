import { useQuery } from '@tanstack/react-query';
import { gmailKeys } from '../queryKeys';
import { getLabels } from '../labels';

export const useLabels = (accountId: string) =>
  useQuery({
    queryKey: gmailKeys.labels(accountId),
    queryFn: () => getLabels(accountId),
    enabled: !!accountId,
  });
