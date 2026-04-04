import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../client';
import { messageRecipients, messages } from '../../schema';
import { getContactActionSignals } from '../userActions';

/** Compute contact importance tiers (1-5) based on email exchange history. */
export function getContactImportanceMap(
  accountId: string,
  userEmail: string,
): Map<string, number> {
  const lowerUser = userEmail.toLowerCase();
  const oneYearAgo = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Received from each contact
  const received = db
    .select({
      email: messages.fromEmail,
      count: sql<number>`COUNT(*)`.as('cnt'),
      oldCount:
        sql<number>`SUM(CASE WHEN ${messages.createdAt} < ${oneYearAgo} THEN 1 ELSE 0 END)`.as(
          'old_cnt',
        ),
      nlCount:
        sql<number>`SUM(CASE WHEN COALESCE(${messages.isNewsletter}, 0) = 1 THEN 1 ELSE 0 END)`.as(
          'nl_cnt',
        ),
    })
    .from(messages)
    .where(
      and(eq(messages.accountId, accountId), ne(messages.fromEmail, lowerUser)),
    )
    .groupBy(messages.fromEmail)
    .all();

  // Sent to each contact
  const sent = db
    .select({
      email: messageRecipients.email,
      count: sql<number>`COUNT(*)`.as('cnt'),
      oldCount:
        sql<number>`SUM(CASE WHEN ${messages.createdAt} < ${oneYearAgo} THEN 1 ELSE 0 END)`.as(
          'old_cnt',
        ),
    })
    .from(messageRecipients)
    .innerJoin(messages, eq(messages.id, messageRecipients.messageId))
    .where(
      and(
        eq(messages.accountId, accountId),
        eq(messages.fromEmail, lowerUser),
        eq(messageRecipients.type, 'to'),
      ),
    )
    .groupBy(messageRecipients.email)
    .all();

  // Build per-contact sent/received counts
  const recvMap = new Map<
    string,
    { count: number; oldCount: number; nlCount: number }
  >();
  const sentMap = new Map<string, { count: number; oldCount: number }>();

  for (const r of received) {
    recvMap.set(r.email, {
      count: r.count,
      oldCount: r.oldCount ?? 0,
      nlCount: r.nlCount ?? 0,
    });
  }
  for (const s of sent) {
    sentMap.set(s.email, { count: s.count, oldCount: s.oldCount ?? 0 });
  }

  // All unique contacts
  const allEmails = new Set([...recvMap.keys(), ...sentMap.keys()]);
  if (allEmails.size === 0) return new Map<string, number>();

  // User action signals (star, archive, trash, reply, view)
  const actionSignals = getContactActionSignals(accountId);

  // Compute rawScore with receive/send ratio penalty
  // Penalty: if received >> sent, the contact is likely a newsletter/notification
  //   sentCount = 0          → ×0.4  (nigdy nie odpowiadasz = prawdopodobnie spam)
  //   received/sent > 10:1   → ×0.5  (bardzo jednostronna komunikacja)
  //   received/sent > 5:1    → ×0.7
  //   received/sent > 3:1    → ×0.85
  //   received/sent ≤ 3:1    → ×1.0  (zdrowa konwersacja, brak kary)
  const scoreMap = new Map<string, number>();

  for (const email of allEmails) {
    const rc = recvMap.get(email)?.count ?? 0;
    const sc = sentMap.get(email)?.count ?? 0;
    const oldR = recvMap.get(email)?.oldCount ?? 0;
    const oldS = sentMap.get(email)?.oldCount ?? 0;
    const nlc = recvMap.get(email)?.nlCount ?? 0;

    // Volume: log of total interactions (prevents high-volume contacts from dominating)
    const volume = Math.log2(1 + rc + sc);
    // Reciprocity: how balanced the conversation is (0 = one-way, 1 = balanced)
    const reciprocity =
      rc > 0 && sc > 0 ? 1 - Math.abs(rc - sc) / (rc + sc) : 0;
    // Historical bonus (tie-breaker, not primary signal)
    const history = oldR * 0.15 + oldS * 0.3;
    const base = volume * (0.5 + 0.5 * reciprocity) + history;

    let multiplier: number;
    if (rc > 0 && nlc / rc > 0.8) {
      multiplier = 0.2;
    } else if (sc === 0) {
      multiplier = 0.4;
    } else {
      const ratio = rc / sc;
      if (ratio > 10) multiplier = 0.5;
      else if (ratio > 5) multiplier = 0.7;
      else if (ratio > 3) multiplier = 0.85;
      else multiplier = 1.0;
    }

    // User action boost (star, view, trash — reply excluded because it already
    // increases sc which feeds into the base formula via volume + reciprocity)
    const actions = actionSignals.get(email);
    let actionBoost = 0;
    if (actions) {
      actionBoost =
        actions.starCount * 1.5 +
        Math.min(actions.viewCount * 0.05, 2.0) -
        actions.trashCount * 0.5;
    }

    scoreMap.set(email, base * multiplier + actionBoost);
  }

  // Sort scores descending; secondary sort by email for deterministic ordering
  const sorted = [...scoreMap.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const total = sorted.length;
  const resultMap = new Map<string, number>();

  for (let i = 0; i < total; i++) {
    const email = sorted[i][0];
    const percentile = i / total; // 0 = highest score
    let tier: number;
    if (percentile < 0.1) tier = 5;
    else if (percentile < 0.25) tier = 4;
    else if (percentile < 0.5) tier = 3;
    else if (percentile < 0.75) tier = 2;
    else tier = 1;

    const rc = recvMap.get(email)?.count ?? 0;
    const sc = sentMap.get(email)?.count ?? 0;

    // Penalty: never replied → tier -2 (but only for contacts with >10 emails,
    // to not bury new contacts you haven't had time to reply to yet)
    if (sc === 0 && rc > 10) tier = Math.max(1, tier - 2);
    // Boost: new or recent contact (≤10 emails, no reply yet) → minimum tier 3
    if (rc >= 1 && rc <= 10 && sc === 0 && tier < 3) tier = 3;

    resultMap.set(email, tier);
  }

  return resultMap;
}

export interface ContactImportanceDetail {
  email: string;
  tier: number;
  receivedCount: number;
  sentCount: number;
  newsletterRatio: number;
  multiplier: number;
  reason: string;
}

/** Returns per-contact tier details with explanation of why each tier was assigned. */
export function getContactImportanceDetails(
  accountId: string,
  userEmail: string,
): ContactImportanceDetail[] {
  const lowerUser = userEmail.toLowerCase();
  const oneYearAgo = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const received = db
    .select({
      email: messages.fromEmail,
      count: sql<number>`COUNT(*)`.as('cnt'),
      oldCount:
        sql<number>`SUM(CASE WHEN ${messages.createdAt} < ${oneYearAgo} THEN 1 ELSE 0 END)`.as(
          'old_cnt',
        ),
      nlCount:
        sql<number>`SUM(CASE WHEN COALESCE(${messages.isNewsletter}, 0) = 1 THEN 1 ELSE 0 END)`.as(
          'nl_cnt',
        ),
    })
    .from(messages)
    .where(
      and(eq(messages.accountId, accountId), ne(messages.fromEmail, lowerUser)),
    )
    .groupBy(messages.fromEmail)
    .all();

  const sent = db
    .select({
      email: messageRecipients.email,
      count: sql<number>`COUNT(*)`.as('cnt'),
      oldCount:
        sql<number>`SUM(CASE WHEN ${messages.createdAt} < ${oneYearAgo} THEN 1 ELSE 0 END)`.as(
          'old_cnt',
        ),
    })
    .from(messageRecipients)
    .innerJoin(messages, eq(messages.id, messageRecipients.messageId))
    .where(
      and(
        eq(messages.accountId, accountId),
        eq(messages.fromEmail, lowerUser),
        eq(messageRecipients.type, 'to'),
      ),
    )
    .groupBy(messageRecipients.email)
    .all();

  const recvMap = new Map<
    string,
    { count: number; oldCount: number; nlCount: number }
  >();
  const sentMap = new Map<string, { count: number; oldCount: number }>();

  for (const r of received) {
    recvMap.set(r.email, {
      count: r.count,
      oldCount: r.oldCount ?? 0,
      nlCount: r.nlCount ?? 0,
    });
  }
  for (const s of sent) {
    sentMap.set(s.email, { count: s.count, oldCount: s.oldCount ?? 0 });
  }

  const allEmails = new Set([...recvMap.keys(), ...sentMap.keys()]);
  if (allEmails.size === 0) return [];

  const actionSignals = getContactActionSignals(accountId);

  const scoreMap = new Map<
    string,
    { score: number; multiplier: number; nlRatio: number }
  >();

  for (const email of allEmails) {
    const rc = recvMap.get(email)?.count ?? 0;
    const sc = sentMap.get(email)?.count ?? 0;
    const oldR = recvMap.get(email)?.oldCount ?? 0;
    const oldS = sentMap.get(email)?.oldCount ?? 0;
    const nlc = recvMap.get(email)?.nlCount ?? 0;

    const volume = Math.log2(1 + rc + sc);
    const reciprocity =
      rc > 0 && sc > 0 ? 1 - Math.abs(rc - sc) / (rc + sc) : 0;
    const history = oldR * 0.15 + oldS * 0.3;
    const base = volume * (0.5 + 0.5 * reciprocity) + history;
    const nlRatio = rc > 0 ? nlc / rc : 0;

    let multiplier: number;
    if (rc > 0 && nlRatio > 0.8) {
      multiplier = 0.2;
    } else if (sc === 0) {
      multiplier = 0.4;
    } else {
      const ratio = rc / sc;
      if (ratio > 10) multiplier = 0.5;
      else if (ratio > 5) multiplier = 0.7;
      else if (ratio > 3) multiplier = 0.85;
      else multiplier = 1.0;
    }

    const actions = actionSignals.get(email);
    let actionBoost = 0;
    if (actions) {
      actionBoost =
        actions.starCount * 1.5 +
        Math.min(actions.viewCount * 0.05, 2.0) -
        actions.trashCount * 0.5;
    }

    scoreMap.set(email, {
      score: base * multiplier + actionBoost,
      multiplier,
      nlRatio,
    });
  }

  const sorted = [...scoreMap.entries()].sort(
    (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
  );
  const total = sorted.length;
  const results: ContactImportanceDetail[] = [];

  for (let i = 0; i < total; i++) {
    const email = sorted[i][0];
    const { multiplier, nlRatio } = sorted[i][1];
    const rc = recvMap.get(email)?.count ?? 0;
    const sc = sentMap.get(email)?.count ?? 0;
    const percentile = i / total;

    let tier: number;
    if (percentile < 0.1) tier = 5;
    else if (percentile < 0.25) tier = 4;
    else if (percentile < 0.5) tier = 3;
    else if (percentile < 0.75) tier = 2;
    else tier = 1;

    // Penalty: never replied but >10 emails → tier -2 (established one-way sender)
    if (sc === 0 && rc > 10) tier = Math.max(1, tier - 2);
    // Boost: new/recent contact (≤10 emails, no reply yet) → minimum tier 3
    if (rc >= 1 && rc <= 10 && sc === 0 && tier < 3) tier = 3;

    let reason: string;
    if (nlRatio > 0.8) {
      reason = 'Newsletter';
    } else if (sc > 0 && rc > 0 && rc / sc <= 3) {
      reason = 'Two-way conversation';
    } else if (sc > 0 && rc > 0) {
      reason = `One-sided (${rc}:${sc} ratio)`;
    } else if (sc === 0 && rc > 10) {
      reason = 'Never replied';
    } else if (sc === 0 && rc > 0) {
      reason = 'New contact';
    } else {
      reason = 'Sent only';
    }

    if (rc >= 1 && rc <= 10 && tier === 3 && sc === 0) {
      reason += ' · Boost';
    }

    const actions = actionSignals.get(email);
    if (actions) {
      const parts: string[] = [];
      if (actions.starCount > 0) parts.push(`${actions.starCount} star`);
      if (actions.replyCount > 0) parts.push(`${actions.replyCount} reply`);
      if (actions.viewCount > 0) parts.push(`${actions.viewCount} view`);
      if (actions.trashCount > 0) parts.push(`${actions.trashCount} trash`);
      if (parts.length > 0) reason += ` · Actions: ${parts.join(', ')}`;
    }

    results.push({
      email,
      tier,
      receivedCount: rc,
      sentCount: sc,
      newsletterRatio: nlRatio,
      multiplier,
      reason,
    });
  }

  return results;
}
