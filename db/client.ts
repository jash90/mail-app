import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const expoDb = openDatabaseSync('mail.db');
expoDb.execSync('PRAGMA journal_mode = WAL');
expoDb.execSync('PRAGMA foreign_keys = ON');

export const db = drizzle(expoDb, { schema });
export type Database = typeof db;

export function clearAllData() {
  try {
    expoDb.execSync('PRAGMA foreign_keys = OFF');
    expoDb.execSync(`
      BEGIN;
      DELETE FROM ai_token_usage;
      DELETE FROM summary_cache;
      DELETE FROM attachments;
      DELETE FROM message_recipients;
      DELETE FROM thread_labels;
      DELETE FROM thread_participants;
      DELETE FROM messages;
      DELETE FROM threads;
      DELETE FROM participants;
      DELETE FROM labels;
      DELETE FROM sync_state;
      COMMIT;
    `);
  } catch (error) {
    expoDb.execSync('ROLLBACK');
    throw error;
  } finally {
    expoDb.execSync('PRAGMA foreign_keys = ON');
  }
}
