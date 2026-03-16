import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const expoDb = openDatabaseSync('mail.db');
expoDb.execSync('PRAGMA journal_mode = WAL');
expoDb.execSync('PRAGMA foreign_keys = ON');

export const db = drizzle(expoDb, { schema });
export type Database = typeof db;

export function clearAllData() {
  expoDb.execSync('PRAGMA foreign_keys = OFF');
  expoDb.execSync('DELETE FROM summary_cache');
  expoDb.execSync('DELETE FROM attachments');
  expoDb.execSync('DELETE FROM message_recipients');
  expoDb.execSync('DELETE FROM thread_labels');
  expoDb.execSync('DELETE FROM thread_participants');
  expoDb.execSync('DELETE FROM messages');
  expoDb.execSync('DELETE FROM threads');
  expoDb.execSync('DELETE FROM participants');
  expoDb.execSync('DELETE FROM labels');
  expoDb.execSync('DELETE FROM sync_state');
  expoDb.execSync('PRAGMA foreign_keys = ON');
}
