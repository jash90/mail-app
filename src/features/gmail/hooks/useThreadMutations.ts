import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { gmailKeys } from '../services/queryKeys';
import {
  markAsRead,
  markAsUnread,
  toggleStar,
  archiveThread,
  trashThread,
  deleteThread,
} from '../services/modify';
import { recordAction } from '@/src/shared/db/repositories/userActions';

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
  useGmailMutation(
    accountId,
    async (vars: { messageId: string; threadId: string; starred: boolean }) => {
      const ok = await toggleStar(vars.messageId, vars.starred);
      if (ok && vars.threadId) {
        recordAction(
          accountId,
          vars.threadId,
          vars.starred ? 'star' : 'unstar',
        );
      }
      return ok;
    },
  );

export const useArchiveThread = (accountId: string) =>
  useGmailMutation(accountId, archiveThread);

export const useTrashThread = (accountId: string) =>
  useGmailMutation(accountId, trashThread);

export const useDeleteThread = (accountId: string) =>
  useGmailMutation(accountId, deleteThread);
