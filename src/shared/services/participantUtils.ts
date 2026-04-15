import type { EmailParticipant } from '@/src/shared/types';

export function getSenderDisplayName(participants: EmailParticipant[]): string {
  return participants[0]?.name || participants[0]?.email || 'Unknown';
}
