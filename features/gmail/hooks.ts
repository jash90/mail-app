import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { ComposeEmailData } from '@/types';
import { gmailKeys } from './queryKeys';
import { listThreads, getThread } from './threads';
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

const FIVE_MINUTES = 5 * 60 * 1000;

const useGmailMutation = <TVariables>(
  accountId: string,
  mutationFn: (vars: TVariables) => Promise<boolean>,
  extraInvalidateKeys?: (vars: TVariables) => QueryKey[],
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data: boolean, variables: TVariables) => {
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
      extraInvalidateKeys?.(variables).forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      );
    },
  });
};

export const useThreads = (accountId: string, labelIds: string[] = ['INBOX']) =>
  useInfiniteQuery({
    queryKey: gmailKeys.threads(accountId, labelIds),
    queryFn: ({ pageParam }) =>
      listThreads(accountId, labelIds, {
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: !!accountId,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES,
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
      queryClient.invalidateQueries({ queryKey: gmailKeys.thread(accountId, variables.threadId) });
      queryClient.invalidateQueries({ queryKey: gmailKeys.messages(accountId, variables.threadId) });
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

export const useSearchContacts = (query: string) =>
  useQuery({
    queryKey: gmailKeys.contacts(query),
    queryFn: () => searchContacts(query),
    enabled: query.length >= 2,
    staleTime: FIVE_MINUTES,
  });
