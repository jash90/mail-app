/**
 * Gmail API Response Types
 */

export interface GmailThread {
  id: string;
  historyId: string;
  messages?: GmailMessage[];
  snippet?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: GmailMessagePayload;
  sizeEstimate: number;
  raw?: string;
}

export interface GmailMessagePayload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: Array<{ name: string; value: string }>;
  body: { attachmentId?: string; size: number; data?: string };
  parts?: GmailMessagePayload[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  color?: { textColor: string; backgroundColor: string };
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailHistoryEvent {
  id: string;
  messages?: Array<{ id: string; threadId: string; labelIds: string[] }>;
  messagesAdded?: Array<{ message: GmailMessage }>;
  messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
  labelsAdded?: Array<{
    message: { id: string; threadId: string };
    labelIds: string[];
  }>;
  labelsRemoved?: Array<{
    message: { id: string; threadId: string };
    labelIds: string[];
  }>;
}
