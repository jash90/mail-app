jest.mock('@/src/shared/db/client', () => require('../mockClient'));

import type { EmailThread } from '@/src/shared/types';
import { upsertThreads } from '@/src/shared/db/repositories/threads/upsert';
import {
  getThreadsPaginated,
  getUnreadThreads,
  getThreadCount,
} from '@/src/shared/db/repositories/threads/queries';
import {
  updateThreadFlags,
  deleteThread,
} from '@/src/shared/db/repositories/threads/mutations';
import { closeTestDb } from '../mockClient';

afterAll(() => closeTestDb());

const accountId = 'test-account';
const now = new Date().toISOString();

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  const id =
    overrides.id ??
    `${accountId}_thread-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    account_id: accountId,
    provider_thread_id: overrides.provider_thread_id ?? id!.split('_')[1]!,
    subject: 'Test Subject',
    snippet: 'Test snippet',
    participants: [{ email: 'sender@test.com', name: 'Sender' }],
    last_message_at: now,
    message_count: 1,
    is_read: true,
    is_starred: false,
    is_archived: false,
    is_trashed: false,
    label_ids: ['INBOX'],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('threads repository', () => {
  describe('upsertThreads', () => {
    it('inserts new threads with participants and labels', () => {
      const thread = makeThread({
        id: `${accountId}_t1`,
        provider_thread_id: 't1',
        subject: 'First thread',
      });
      upsertThreads([thread]);

      const count = getThreadCount(accountId);
      expect(count).toBe(1);
    });

    it('updates existing threads on conflict', () => {
      const thread = makeThread({
        id: `${accountId}_t1`,
        provider_thread_id: 't1',
        subject: 'Updated subject',
        is_read: false,
      });
      upsertThreads([thread]);

      const threads = getThreadsPaginated(accountId);
      const found = threads.find((t) => t.id === `${accountId}_t1`);
      expect(found!.subject).toBe('Updated subject');
      expect(found!.is_read).toBe(false);
    });

    it('handles batch upsert of multiple threads', () => {
      const threads = Array.from({ length: 5 }, (_, i) =>
        makeThread({
          id: `${accountId}_batch-${i}`,
          provider_thread_id: `batch-${i}`,
          subject: `Batch thread ${i}`,
          last_message_at: new Date(Date.now() - i * 3600000).toISOString(),
        }),
      );
      upsertThreads(threads);

      const count = getThreadCount(accountId);
      expect(count).toBeGreaterThanOrEqual(5);
    });

    it('handles empty list', () => {
      upsertThreads([]);
    });
  });

  describe('getThreadsPaginated', () => {
    it('returns threads sorted by most recent', () => {
      const oldThread = makeThread({
        id: `${accountId}_old`,
        provider_thread_id: 'old',
        last_message_at: '2025-01-01T00:00:00Z',
      });
      const newThread = makeThread({
        id: `${accountId}_new`,
        provider_thread_id: 'new',
        last_message_at: '2026-12-01T00:00:00Z',
      });
      upsertThreads([oldThread, newThread]);

      const threads = getThreadsPaginated(accountId, { sortMode: 'recent' });
      const ids = threads.map((t) => t.id);
      const oldIdx = ids.indexOf(`${accountId}_old`);
      const newIdx = ids.indexOf(`${accountId}_new`);
      expect(newIdx).toBeLessThan(oldIdx);
    });

    it('respects limit and offset', () => {
      const page1 = getThreadsPaginated(accountId, { limit: 2, offset: 0 });
      const page2 = getThreadsPaginated(accountId, { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2.length).toBeGreaterThanOrEqual(1);
      const page1Ids = new Set(page1.map((t) => t.id));
      for (const t of page2) {
        expect(page1Ids.has(t.id)).toBe(false);
      }
    });

    it('filters by label IDs', () => {
      const threads = getThreadsPaginated(accountId, {
        labelIds: ['INBOX'],
      });
      for (const t of threads) {
        expect(t.label_ids).toContain('INBOX');
      }
    });

    it('excludes trashed threads', () => {
      const trashed = makeThread({
        id: `${accountId}_trashed`,
        provider_thread_id: 'trashed',
        is_trashed: true,
      });
      upsertThreads([trashed]);

      const threads = getThreadsPaginated(accountId);
      expect(
        threads.find((t) => t.id === `${accountId}_trashed`),
      ).toBeUndefined();
    });

    it('hydrates participants', () => {
      const thread = makeThread({
        id: `${accountId}_with-parts`,
        provider_thread_id: 'with-parts',
        participants: [
          { email: 'alice@test.com', name: 'Alice' },
          { email: 'bob@test.com', name: 'Bob' },
        ],
      });
      upsertThreads([thread]);

      const threads = getThreadsPaginated(accountId);
      const found = threads.find((t) => t.id === `${accountId}_with-parts`);
      expect(found!.participants).toHaveLength(2);
      expect(found!.participants[0]!.email).toBe('alice@test.com');
      expect(found!.participants[1]!.email).toBe('bob@test.com');
    });
  });

  describe('getUnreadThreads', () => {
    it('returns only unread INBOX threads', () => {
      upsertThreads([
        makeThread({
          id: `${accountId}_unread1`,
          provider_thread_id: 'unread1',
          is_read: false,
          label_ids: ['INBOX'],
        }),
      ]);

      const unread = getUnreadThreads(accountId);
      for (const t of unread) {
        expect(t.is_read).toBe(false);
      }
    });
  });

  describe('updateThreadFlags', () => {
    it('updates is_read flag', () => {
      const id = `${accountId}_flag-test`;
      upsertThreads([
        makeThread({ id, provider_thread_id: 'flag-test', is_read: true }),
      ]);

      updateThreadFlags(id, { is_read: false });

      const threads = getThreadsPaginated(accountId);
      const found = threads.find((t) => t.id === id);
      expect(found!.is_read).toBe(false);
    });
  });

  describe('deleteThread', () => {
    it('removes thread from database', () => {
      const id = `${accountId}_to-delete`;
      upsertThreads([makeThread({ id, provider_thread_id: 'to-delete' })]);

      const before = getThreadCount(accountId);
      deleteThread(id);
      const after = getThreadCount(accountId);

      expect(after).toBe(before - 1);
    });
  });
});
