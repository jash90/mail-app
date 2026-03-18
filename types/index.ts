export interface EmailParticipant {
  name: string | null;
  email: string;
}

export interface EmailAttachment {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  size: number;
  content_id?: string;
  is_inline: boolean;
}

export interface ComposeEmailData {
  from?: EmailParticipant;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  subject: string;
  body: string;
  bodyHtml?: string;
  inReplyTo?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; content: string; mimeType: string }>;
}

export interface SendEmailResult {
  success: boolean;
  message_id?: string;
  thread_id?: string;
  error?: string;
}

export interface CursorPagination {
  cursor?: string;
  limit?: number;
}

export interface EmailLabel {
  id: string;
  account_id: string;
  provider_label_id: string;
  name: string;
  type: 'system' | 'user';
  color?: string;
  message_count?: number;
  unread_count?: number;
}

export interface EmailThread {
  id: string;
  account_id: string;
  provider_thread_id: string;
  subject: string;
  snippet: string;
  participants: EmailParticipant[];
  last_message_at: string;
  message_count: number;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  is_newsletter?: boolean;
  is_auto_reply?: boolean;
  label_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  account_id: string;
  provider_message_id: string;
  thread_id: string;
  provider_thread_id: string;
  subject: string;
  snippet: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  reply_to: EmailParticipant | null;
  body: { text: string; html: string };
  attachments: EmailAttachment[];
  headers: {
    message_id: string;
    in_reply_to?: string;
    references?: string[];
  };
  size_estimate?: number;
  is_newsletter?: boolean;
  is_auto_reply?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  history_id?: string;
  last_synced_at?: string;
  next_page_token?: string;
  error_message?: string;
}

export interface SyncResult {
  success: boolean;
  synced_threads: number;
  synced_messages: number;
  errors: string[];
  new_sync_state: SyncState;
}
