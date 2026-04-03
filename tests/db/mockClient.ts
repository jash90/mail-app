/**
 * Mock db client for testing. This module is designed to be used
 * with jest.mock('@/db/client', () => require('../db/mockClient'))
 * from inside tests/db/repositories/.
 *
 * Each test file gets its own module instance due to jest's module isolation.
 */
import { createTestDb } from './testDb';

const instance = createTestDb();

export const db = instance.db;
export const expoDb = instance.sqlite;

export function closeTestDb() {
  instance.sqlite.close();
}

export function clearAllData() {
  instance.sqlite.exec(`
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
  `);
}
