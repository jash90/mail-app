import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { gmailKeys } from '../queryKeys';
import {
  markAsRead,
  markAsUnread,
  toggleStar,
  archiveThread,
  trashThread,
  deleteThread,
} from '../modify';

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
