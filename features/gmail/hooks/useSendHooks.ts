import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ComposeEmailData } from '@/types';
import { gmailKeys } from '../queryKeys';
import { sendEmail, sendReply } from '../send';

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
