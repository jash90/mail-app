import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ComposeEmailData } from '@/types';
import { gmailKeys } from '../queryKeys';
import { sendEmail, sendReply } from '../send';
import { recordActionForContact } from '@/db/repositories/userActions';

export const useSendEmail = (accountId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ComposeEmailData) => sendEmail(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
      for (const to of variables.to) {
        recordActionForContact(accountId, to.email, 'send');
      }
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
      for (const to of variables.data.to) {
        recordActionForContact(
          accountId,
          to.email,
          'reply',
          variables.threadId,
        );
      }
    },
  });
};
