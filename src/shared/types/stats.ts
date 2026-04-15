/** Lightweight message representation for stats computation — avoids full EmailMessage overhead */
export interface StatMessage {
  id: string; // Gmail message ID
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  date: number; // timestamp ms
  sizeEstimate?: number;
  isNewsletter?: boolean;
  isAutoReply?: boolean;
}
