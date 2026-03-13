import { eq, sql } from 'drizzle-orm';
import { db } from '../client';
import { labels } from '../schema';
import type { EmailLabel } from '@/types';

/** Batch upsert labels. */
export function upsertLabels(labelList: EmailLabel[]): void {
  if (labelList.length === 0) return;

  db.transaction((tx) => {
    for (const l of labelList) {
      tx.insert(labels)
        .values({
          id: l.id,
          accountId: l.account_id,
          providerLabelId: l.provider_label_id,
          name: l.name,
          type: l.type,
          color: l.color ?? null,
          messageCount: l.message_count ?? null,
          unreadCount: l.unread_count ?? null,
        })
        .onConflictDoUpdate({
          target: labels.id,
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            color: sql`excluded.color`,
            messageCount: sql`excluded.message_count`,
            unreadCount: sql`excluded.unread_count`,
          },
        })
        .run();
    }
  });
}

/** Get all labels for an account. */
export function getLabels(accountId: string): EmailLabel[] {
  const rows = db
    .select()
    .from(labels)
    .where(eq(labels.accountId, accountId))
    .all();

  return rows.map((row) => ({
    id: row.id,
    account_id: row.accountId,
    provider_label_id: row.providerLabelId,
    name: row.name,
    type: row.type,
    color: row.color ?? undefined,
    message_count: row.messageCount ?? undefined,
    unread_count: row.unreadCount ?? undefined,
  }));
}
