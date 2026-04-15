jest.mock('@/src/shared/db/client', () => require('../mockClient'));

import type { EmailMessage, EmailThread } from '@/src/shared/types';
import { upsertThreads } from '@/src/shared/db/repositories/threads/upsert';
import {
  upsertMessages,
  getMessagesByThread,
} from '@/src/shared/db/repositories/messages';
import { closeTestDb } from '../mockClient';

afterAll(() => closeTestDb());

const accountId = 'test-account';
const threadId = `${accountId}_thread-msg-test`;
const now = new Date().toISOString();

function makeThread(): EmailThread {
  return {
    id: threadId,
    account_id: accountId,
    provider_thread_id: 'thread-msg-test',
    subject: 'Message test thread',
    snippet: 'Snippet',
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
  };
}

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    account_id: accountId,
    provider_message_id: id,
    thread_id: threadId,
    provider_thread_id: 'thread-msg-test',
    subject: 'Test message',
    snippet: 'Message snippet',
    from: { email: 'sender@test.com', name: 'Sender' },
    to: [{ email: 'recipient@test.com', name: 'Recipient' }],
    cc: [],
    bcc: [],
    reply_to: null,
    body: { text: 'Hello world', html: '<p>Hello world</p>' },
    attachments: [],
    headers: { message_id: `<${id}@test.com>` },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('messages repository', () => {
  beforeAll(() => {
    upsertThreads([makeThread()]);
  });

  it('upserts and retrieves messages by thread', () => {
    const msg = makeMessage({ id: 'msg-1' });
    upsertMessages([msg]);

    const messages = getMessagesByThread(threadId);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.id).toBe('msg-1');
    expect(messages[0]!.from.email).toBe('sender@test.com');
  });

  it('hydrates recipients correctly', () => {
    const msg = makeMessage({
      id: 'msg-recipients',
      to: [
        { email: 'to1@test.com', name: 'To 1' },
        { email: 'to2@test.com', name: 'To 2' },
      ],
      cc: [{ email: 'cc@test.com', name: 'CC' }],
      bcc: [{ email: 'bcc@test.com', name: null }],
    });
    upsertMessages([msg]);

    const messages = getMessagesByThread(threadId);
    const found = messages.find((m) => m.id === 'msg-recipients')!;
    expect(found.to).toHaveLength(2);
    expect(found.cc).toHaveLength(1);
    expect(found.bcc).toHaveLength(1);
    expect(found.cc[0]!.email).toBe('cc@test.com');
  });

  it('updates existing message on conflict', () => {
    const msg = makeMessage({
      id: 'msg-1',
      subject: 'Updated subject',
      body: { text: 'Updated body', html: '<p>Updated</p>' },
    });
    upsertMessages([msg]);

    const messages = getMessagesByThread(threadId);
    const found = messages.find((m) => m.id === 'msg-1')!;
    expect(found.subject).toBe('Updated subject');
    expect(found.body.text).toBe('Updated body');
  });

  it('handles attachments', () => {
    const msg = makeMessage({
      id: 'msg-with-attachment',
      attachments: [
        {
          id: 'att-1',
          message_id: 'msg-with-attachment',
          filename: 'document.pdf',
          mime_type: 'application/pdf',
          size: 12345,
          is_inline: false,
        },
      ],
    });
    upsertMessages([msg]);

    const messages = getMessagesByThread(threadId);
    const found = messages.find((m) => m.id === 'msg-with-attachment')!;
    expect(found.attachments).toHaveLength(1);
    expect(found.attachments[0]!.filename).toBe('document.pdf');
    expect(found.attachments[0]!.size).toBe(12345);
  });

  it('handles multiple messages in batch', () => {
    const msgs = Array.from({ length: 3 }, (_, i) =>
      makeMessage({
        id: `batch-msg-${i}`,
        created_at: new Date(Date.now() + i * 60000).toISOString(),
      }),
    );
    upsertMessages(msgs);

    const messages = getMessagesByThread(threadId);
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it('orders messages by created_at', () => {
    const messages = getMessagesByThread(threadId);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i]!.created_at >= messages[i - 1]!.created_at).toBe(true);
    }
  });

  it('handles empty list gracefully', () => {
    upsertMessages([]);
  });
});
