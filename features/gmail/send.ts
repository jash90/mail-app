import type { ComposeEmailData, SendEmailResult } from '@/types';
import { gmailRequest } from './api';
import { createRawEmail } from './helpers';
import { getMessage } from './messages';

export const sendEmail = async (
  data: ComposeEmailData,
): Promise<SendEmailResult> => {
  const rawMessage = createRawEmail(data);
  const response = await gmailRequest<{ id: string; threadId: string }>(
    '/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({ raw: rawMessage }),
    },
  );
  return {
    success: true,
    message_id: response.id,
    thread_id: response.threadId,
  };
};

export const sendReply = async (
  accountId: string,
  threadId: string,
  messageId: string,
  data: ComposeEmailData,
): Promise<SendEmailResult> => {
  const original = await getMessage(accountId, messageId);
  if (!original) {
    throw new Error('Original message not found');
  }
  const rawMessage = createRawEmail({
    ...data,
    inReplyTo: original.headers.message_id,
    threadId,
  });
  const response = await gmailRequest<{ id: string; threadId: string }>(
    '/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({
        raw: rawMessage,
        threadId: threadId.replace(`${accountId}_`, ''),
      }),
    },
  );
  return {
    success: true,
    message_id: response.id,
    thread_id: response.threadId,
  };
};
