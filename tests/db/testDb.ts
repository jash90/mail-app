import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

/**
 * Create an in-memory SQLite database with the full schema for testing.
 * Returns a Drizzle instance that mirrors the production `db` export.
 */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables in dependency order
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_label_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT,
      message_count INTEGER,
      unread_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_thread_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      last_message_at TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 1,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      is_newsletter INTEGER DEFAULT 0,
      is_auto_reply INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_threads_account ON threads(account_id);
    CREATE INDEX IF NOT EXISTS idx_threads_last_message ON threads(account_id, last_message_at);
    CREATE INDEX IF NOT EXISTS idx_threads_unread ON threads(account_id, is_read, last_message_at);

    CREATE TABLE IF NOT EXISTS thread_labels (
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, label_id)
    );

    CREATE INDEX IF NOT EXISTS idx_thread_labels_label ON thread_labels(label_id);

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_email ON participants(email);

    CREATE TABLE IF NOT EXISTS thread_participants (
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (thread_id, participant_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      provider_thread_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL,
      from_name TEXT,
      body_text TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      header_message_id TEXT,
      header_in_reply_to TEXT,
      header_references TEXT,
      size_estimate INTEGER,
      is_newsletter INTEGER DEFAULT 0,
      is_auto_reply INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_email);
    CREATE INDEX IF NOT EXISTS idx_messages_account_created ON messages(account_id, created_at);

    CREATE TABLE IF NOT EXISTS message_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_message ON message_recipients(message_id);
    CREATE INDEX IF NOT EXISTS idx_recipients_email ON message_recipients(email);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      content_id TEXT,
      is_inline INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS summary_cache (
      key TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      account_id TEXT PRIMARY KEY,
      history_id TEXT,
      last_synced_at TEXT,
      next_page_token TEXT,
      status TEXT NOT NULL DEFAULT 'idle'
    );
  `);

  const testDb = drizzle(sqlite, { schema });
  return { db: testDb, sqlite };
}
