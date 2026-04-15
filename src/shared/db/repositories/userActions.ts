import { eq, and, sql } from 'drizzle-orm';
import { db } from '../client';
import { userActions } from '../schema';
import { getSenderEmails } from './threads/hydration';

type ActionType =
  | 'star'
  | 'unstar'
  | 'archive'
  | 'trash'
  | 'reply'
  | 'send'
  | 'view';

/**
 * Record a user action against a contact (resolved from threadId).
 * Fire-and-forget — failures are silently ignored.
 */
export function recordAction(
  accountId: string,
  threadId: string,
  actionType: ActionType,
): void {
  const senderMap = getSenderEmails([threadId]);
  const contactEmail = senderMap.get(threadId);
  if (!contactEmail) return;

  db.insert(userActions)
    .values({
      accountId,
      contactEmail,
      threadId,
      actionType,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Record a user action with an explicit contact email (for compose/send where threadId may not map to a sender).
 */
export function recordActionForContact(
  accountId: string,
  contactEmail: string,
  actionType: ActionType,
  threadId?: string,
): void {
  db.insert(userActions)
    .values({
      accountId,
      contactEmail: contactEmail.toLowerCase(),
      threadId: threadId ?? null,
      actionType,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export interface ContactActionSignals {
  starCount: number;
  archiveCount: number;
  trashCount: number;
  replyCount: number;
  viewCount: number;
}

/**
 * Get aggregated action signals per contact for tier calculation.
 * Returns a map of contactEmail → action counts.
 */
export function getContactActionSignals(
  accountId: string,
): Map<string, ContactActionSignals> {
  const rows = db
    .select({
      contactEmail: userActions.contactEmail,
      starCount:
        sql<number>`SUM(CASE WHEN ${userActions.actionType} = 'star' THEN 1 WHEN ${userActions.actionType} = 'unstar' THEN -1 ELSE 0 END)`.as(
          'star_count',
        ),
      archiveCount:
        sql<number>`SUM(CASE WHEN ${userActions.actionType} = 'archive' THEN 1 ELSE 0 END)`.as(
          'archive_count',
        ),
      trashCount:
        sql<number>`SUM(CASE WHEN ${userActions.actionType} = 'trash' THEN 1 ELSE 0 END)`.as(
          'trash_count',
        ),
      replyCount:
        sql<number>`SUM(CASE WHEN ${userActions.actionType} = 'reply' THEN 1 ELSE 0 END)`.as(
          'reply_count',
        ),
      viewCount:
        sql<number>`SUM(CASE WHEN ${userActions.actionType} = 'view' THEN 1 ELSE 0 END)`.as(
          'view_count',
        ),
    })
    .from(userActions)
    .where(eq(userActions.accountId, accountId))
    .groupBy(userActions.contactEmail)
    .all();

  const result = new Map<string, ContactActionSignals>();
  for (const r of rows) {
    result.set(r.contactEmail, {
      starCount: Math.max(0, r.starCount ?? 0),
      archiveCount: r.archiveCount ?? 0,
      trashCount: r.trashCount ?? 0,
      replyCount: r.replyCount ?? 0,
      viewCount: r.viewCount ?? 0,
    });
  }
  return result;
}
