import {
  getHeader,
  parseEmailAddress,
  parseEmailAddressList,
} from '@/features/gmail/helpers';
import type { GmailMessage } from '@/features/gmail/types';
import type { StatMessage } from './types';

export const GMAIL_ID_RE = /^[0-9a-f]+$/i;

/** Extract only the fields needed for stats from a Gmail message — no body, no attachments */
export function extractStatMessage(msg: GmailMessage): StatMessage {
  const headers = msg.payload.headers;
  const fromRaw = getHeader(headers, 'From') || '';
  const from = parseEmailAddress(fromRaw).email.toLowerCase();

  const extractEmails = (header: string): string[] =>
    parseEmailAddressList(getHeader(headers, header) || '').map((p) =>
      p.email.toLowerCase(),
    );

  const listId = getHeader(headers, 'List-Id') || '';
  const listUnsubscribe = getHeader(headers, 'List-Unsubscribe') || '';
  const autoSubmitted = getHeader(headers, 'Auto-Submitted') || '';

  return {
    id: msg.id,
    from,
    to: extractEmails('To'),
    cc: extractEmails('Cc'),
    bcc: extractEmails('Bcc'),
    date: parseInt(msg.internalDate, 10),
    sizeEstimate: msg.sizeEstimate,
    isNewsletter: listId !== '' || listUnsubscribe !== '',
    isAutoReply: autoSubmitted !== '' && autoSubmitted.toLowerCase() !== 'no',
  };
}
