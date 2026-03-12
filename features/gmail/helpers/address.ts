/**
 * Email address parsing utilities.
 */

import type { EmailParticipant } from '@/types';
import type { GmailMessage } from '../types';
import { fixTextEncoding } from './encoding';
import { getHeader } from './mime';

/**
 * Parse a single email address string into EmailParticipant
 */
export function parseEmailAddress(addressString: string): EmailParticipant {
  const match = addressString.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  if (match) {
    const rawName = match[1] || null;
    return { name: rawName ? fixTextEncoding(rawName) : null, email: match[2] };
  }
  return { name: null, email: addressString };
}

/**
 * Parse a comma-separated list of email addresses
 */
export function parseEmailAddressList(addressString: string): EmailParticipant[] {
  if (!addressString) return [];
  return addressString.split(',').map((a) => parseEmailAddress(a.trim()));
}

/**
 * Extract unique participants from a list of messages
 */
export function extractParticipants(messages: GmailMessage[]): EmailParticipant[] {
  const participants = new Map<string, EmailParticipant>();

  for (const message of messages) {
    const from = getHeader(message.payload.headers, 'From');
    if (from) {
      const participant = parseEmailAddress(from);
      participants.set(participant.email, participant);
    }
  }

  return Array.from(participants.values());
}
