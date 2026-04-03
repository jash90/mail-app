jest.mock('@/db/client', () => require('../mockClient'));

import { upsertLabels, getLabels } from '@/db/repositories/labels';
import { closeTestDb } from '../mockClient';

afterAll(() => closeTestDb());

describe('labels repository', () => {
  const accountId = 'test-account';

  it('returns empty array when no labels exist', () => {
    expect(getLabels('nonexistent')).toEqual([]);
  });

  it('upserts and retrieves labels', () => {
    upsertLabels([
      {
        id: 'INBOX',
        account_id: accountId,
        provider_label_id: 'INBOX',
        name: 'Inbox',
        type: 'system',
      },
      {
        id: 'SENT',
        account_id: accountId,
        provider_label_id: 'SENT',
        name: 'Sent',
        type: 'system',
      },
    ]);

    const labels = getLabels(accountId);
    expect(labels).toHaveLength(2);
    expect(labels.map((l) => l.name).sort()).toEqual(['Inbox', 'Sent']);
  });

  it('updates existing labels on conflict', () => {
    upsertLabels([
      {
        id: 'INBOX',
        account_id: accountId,
        provider_label_id: 'INBOX',
        name: 'Inbox (Updated)',
        type: 'system',
        message_count: 42,
      },
    ]);

    const labels = getLabels(accountId);
    const inbox = labels.find((l) => l.id === 'INBOX');
    expect(inbox!.name).toBe('Inbox (Updated)');
    expect(inbox!.message_count).toBe(42);
  });

  it('handles empty list gracefully', () => {
    upsertLabels([]);
  });

  it('scopes labels by account', () => {
    upsertLabels([
      {
        id: 'other-label',
        account_id: 'other-account',
        provider_label_id: 'OTHER',
        name: 'Other',
        type: 'user',
      },
    ]);

    const labels = getLabels(accountId);
    expect(labels.every((l) => l.account_id === accountId)).toBe(true);
  });
});
