import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject').notNull().default(''),
    snippet: text('snippet').notNull().default(''),
    lastMessageAt: text('last_message_at').notNull(),
    messageCount: integer('message_count').notNull().default(0),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(true),
    isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_threads_account').on(table.accountId),
    index('idx_threads_last_message').on(table.accountId, table.lastMessageAt),
    index('idx_threads_unread').on(table.accountId, table.isRead, table.lastMessageAt),
  ],
);

export const threadLabels = sqliteTable(
  'thread_labels',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.labelId] }),
    index('idx_thread_labels_label').on(table.labelId),
  ],
);

export const participants = sqliteTable(
  'participants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    name: text('name'),
  },
  (table) => [uniqueIndex('idx_participants_email').on(table.email)],
);

export const threadParticipants = sqliteTable(
  'thread_participants',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    participantId: integer('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.participantId] })],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject').notNull().default(''),
    snippet: text('snippet').notNull().default(''),
    fromEmail: text('from_email').notNull(),
    fromName: text('from_name'),
    bodyText: text('body_text').notNull().default(''),
    bodyHtml: text('body_html').notNull().default(''),
    headerMessageId: text('header_message_id'),
    headerInReplyTo: text('header_in_reply_to'),
    headerReferences: text('header_references'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_messages_thread').on(table.threadId),
    index('idx_messages_from').on(table.fromEmail),
    index('idx_messages_account_created').on(table.accountId, table.createdAt),
  ],
);

export const messageRecipients = sqliteTable(
  'message_recipients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    type: text('type').$type<'to' | 'cc' | 'bcc'>().notNull(),
    email: text('email').notNull(),
    name: text('name'),
  },
  (table) => [
    index('idx_recipients_message').on(table.messageId),
    index('idx_recipients_email').on(table.email),
  ],
);

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  contentId: text('content_id'),
  isInline: integer('is_inline', { mode: 'boolean' }).notNull().default(false),
});

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerLabelId: text('provider_label_id').notNull(),
  name: text('name').notNull(),
  type: text('type').$type<'system' | 'user'>().notNull(),
  color: text('color'),
  messageCount: integer('message_count'),
  unreadCount: integer('unread_count'),
});

export const summaryCache = sqliteTable('summary_cache', {
  key: text('key').primaryKey(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
});

export const syncState = sqliteTable('sync_state', {
  accountId: text('account_id').primaryKey(),
  historyId: text('history_id'),
  lastSyncedAt: text('last_synced_at'),
  nextPageToken: text('next_page_token'),
  status: text('status').$type<'idle' | 'syncing' | 'error'>().notNull().default('idle'),
});
