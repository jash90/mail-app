import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { gmailKeys } from '../services/queryKeys';
import { getThread } from '../threads';
import { getThreadMessages } from '../services/messages';
import { getThreadsPaginated } from '@/src/shared/db/repositories/threads';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

/** Read threads from SQLite with SQL-based sorting and infinite scrolling. */
export const useThreads = (accountId: string, labelIds: string[] = ['INBOX']) =>
  useInfiniteQuery({
    queryKey: gmailKeys.threads(accountId, labelIds, 'recent'),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getThreadsPaginated(accountId, {
        labelIds,
        sortMode: 'recent',
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
    enabled: !!accountId,
    staleTime: TWENTY_FOUR_HOURS,
    gcTime: TWENTY_FOUR_HOURS,
  });

export const useThread = (accountId: string, threadId: string) =>
  useQuery({
    queryKey: gmailKeys.thread(accountId, threadId),
    queryFn: () => getThread(accountId, threadId),
    enabled: !!accountId && !!threadId,
  });

export const useThreadMessages = (accountId: string, threadId: string) =>
  useQuery({
    queryKey: gmailKeys.messages(accountId, threadId),
    queryFn: () => getThreadMessages(accountId, threadId),
    enabled: !!accountId && !!threadId,
  });
