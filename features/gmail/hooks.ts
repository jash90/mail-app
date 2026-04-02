import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { ComposeEmailData } from '@/types';
import type { SearchParams, SearchResult } from '@/features/search/types';
import { hybridSearch } from '@/features/search/hybridSearch';
import { gmailKeys } from './queryKeys';
import { getThread } from './threads';
import { getThreadMessages } from './messages';
import { getLabels } from './labels';
import { sendEmail, sendReply } from './send';
import { searchContacts } from './contacts';
import {
  markAsRead,
  markAsUnread,
  toggleStar,
  archiveThread,
  trashThread,
  deleteThread,
} from './modify';
import { performIncrementalSync, performFullSync, syncNextPage } from './sync';
import { getThreadsPaginated } from '@/db/repositories/threads';
import { getSyncState, upsertSyncState } from '@/db/repositories/syncState';
import { getContactImportanceMap } from '@/db/repositories/stats';
import { rebuildFTSIndex } from '@/db/repositories/search';
import { resetFTSVerification } from '@/features/search/hybridSearch';

const THIRTY_MINUTES = 30 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

const useGmailMutation = <TVariables>(
  accountId: string,
  mutationFn: (vars: TVariables) => Promise<boolean>,
  extraInvalidateKeys?: (vars: TVariables) => QueryKey[],
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (success: boolean, variables: TVariables) => {
      if (!success) return;
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
      extraInvalidateKeys?.(variables).forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      );
    },
    onError: (error: Error) => {
      console.warn('[useGmailMutation] Gmail operation failed:', error.message);
    },
  });
};

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

/** Fetch the next page of threads from Gmail API when local data runs out. */
export const useSyncNextPage = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncNextPage(accountId),
    onSuccess: (result) => {
      upsertSyncState(accountId, result.new_sync_state);
      if (result.synced_threads > 0) {
        queryClient.invalidateQueries({
          queryKey: gmailKeys.threads(accountId),
        });
      }
    },
  });
};

/** Contact importance tiers (1-5) based on email exchange history. */
export const useContactImportance = (accountId: string, userEmail: string) =>
  useQuery({
    queryKey: ['contact-importance', accountId],
    queryFn: () => getContactImportanceMap(accountId, userEmail),
    enabled: !!accountId && !!userEmail,
    staleTime: THIRTY_MINUTES,
  });

/** Trigger a sync from Gmail API — data lands in SQLite. */
export const useSync = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const state = getSyncState(accountId);
      const result = state?.history_id
        ? await performIncrementalSync(accountId, state)
        : await performFullSync(accountId);
      upsertSyncState(accountId, result.new_sync_state);
      return result;
    },
    onSuccess: () => {
      rebuildFTSIndex(accountId);
      resetFTSVerification();
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
      queryClient.invalidateQueries({
        queryKey: ['contact-importance', accountId],
      });
    },
  });
};

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

export const useLabels = (accountId: string) =>
  useQuery({
    queryKey: gmailKeys.labels(accountId),
    queryFn: () => getLabels(accountId),
    enabled: !!accountId,
  });

export const useSendEmail = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ComposeEmailData) => sendEmail(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
    },
  });
};

export const useSendReply = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      threadId: string;
      messageId: string;
      data: ComposeEmailData;
    }) => sendReply(accountId, vars.threadId, vars.messageId, vars.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: gmailKeys.thread(accountId, variables.threadId),
      });
      queryClient.invalidateQueries({
        queryKey: gmailKeys.messages(accountId, variables.threadId),
      });
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
    },
  });
};

export const useMarkAsRead = (accountId: string) =>
  useGmailMutation(accountId, markAsRead);

export const useMarkAsUnread = (accountId: string) =>
  useGmailMutation(accountId, markAsUnread);

export const useToggleStar = (accountId: string) =>
  useGmailMutation(accountId, (vars: { messageId: string; starred: boolean }) =>
    toggleStar(vars.messageId, vars.starred),
  );

export const useArchiveThread = (accountId: string) =>
  useGmailMutation(accountId, archiveThread);

export const useTrashThread = (accountId: string) =>
  useGmailMutation(accountId, trashThread);

export const useDeleteThread = (accountId: string) =>
  useGmailMutation(accountId, deleteThread);

/**
 * Check if local sync is sufficient for FTS search.
 * Returns true only when sync is fully complete (no next_page_token).
 */
export const isSyncReady = (accountId: string): boolean => {
  if (!accountId) return false;
  const state = getSyncState(accountId);
  return !!state && !state.next_page_token;
};

/** Hybrid search: FTS5 + quick filters + AI reranking with contact stats. */
export const useSearchThreads = (accountId: string, params: SearchParams) =>
  useQuery<SearchResult[]>({
    queryKey: gmailKeys.search(accountId, params.query, {
      ...(params.filters as Record<string, unknown>),
      useGmailApi: params.useGmailApi,
    }),
    queryFn: () => hybridSearch(accountId, params),
    enabled: !!accountId && params.query.length >= 3,
    staleTime: params.useGmailApi ? 60 * 1000 : 5 * 60 * 1000,
  });

export const useSearchContacts = (query: string) =>
  useQuery({
    queryKey: gmailKeys.contacts(query),
    queryFn: () => searchContacts(query),
    enabled: query.length >= 2,
    staleTime: TWENTY_FOUR_HOURS,
  });
