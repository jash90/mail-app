import type {
  ContactStats,
  EmailStats,
  ThreadLengthBucket,
} from '@/features/stats/types';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../client';
import { messageRecipients, messages, participants, threads } from '../schema';

/** Query time-based distribution (e.g. hour-of-day or day-of-week) for messages. */
function getTimeDistribution(
  accountId: string,
  strftimeFormat: string,
  bucketCount: number,
): number[] {
  const rows = db
    .select({
      bucket:
        sql<number>`CAST(strftime(${strftimeFormat}, ${messages.createdAt}) AS INTEGER)`.as(
          'bucket',
        ),
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(messages)
    .where(eq(messages.accountId, accountId))
    .groupBy(sql`bucket`)
    .all();

  const result = new Array(bucketCount).fill(0);
  for (const row of rows) result[row.bucket] = row.count;
  return result;
}

function buildContactStats(
  email: string,
  name: string | null,
  sentCount: number,
  receivedCount: number,
): ContactStats {
  return {
    email,
    name,
    sentCount,
    receivedCount,
    totalCount: sentCount + receivedCount,
    lastExchange: '',
    avgResponseTimeMs: null,
  };
}

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

    const base = (rc > 0 ? sc / rc : sc) + oldR / 4 + oldS * 10;

    let multiplier: number;
    // Newsletter detection via List-Id/List-Unsubscribe headers
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

    scoreMap.set(email, base * multiplier);
  }

  // Sort scores descending to compute percentile-based tiers
  const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
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

    // Boost: 1-5 emaili od kontaktu → minimum tier 3 (nowy, ale realny kontakt)
    const rc = recvMap.get(email)?.count ?? 0;
    if (rc >= 1 && rc <= 5 && tier < 3) tier = 3;

    resultMap.set(email, tier);
  }

  return resultMap;
}

/** Compute full email statistics from SQLite — replaces StatsAccumulator. */
export function computeStatsFromDb(
  accountId: string,
  userEmail: string,
): EmailStats {
  const lowerUser = userEmail.toLowerCase();

  // Top senders (messages received from others)
  const topSenders = db
    .select({
      email: messages.fromEmail,
      name: participants.name,
      receivedCount: sql<number>`COUNT(*)`.as('received_count'),
    })
    .from(messages)
    .leftJoin(participants, eq(participants.email, messages.fromEmail))
    .where(
      and(
        eq(messages.accountId, accountId),
        ne(messages.fromEmail, lowerUser),
        sql`COALESCE(${messages.isNewsletter}, 0) = 0`,
        sql`COALESCE(${messages.isAutoReply}, 0) = 0`,
      ),
    )
    .groupBy(messages.fromEmail)
    .orderBy(sql`received_count DESC`)
    .limit(10)
    .all();

  // Top recipients (messages sent by user to others)
  const topRecipients = db
    .select({
      email: messageRecipients.email,
      name: messageRecipients.name,
      sentCount: sql<number>`COUNT(*)`.as('sent_count'),
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
    .orderBy(sql`sent_count DESC`)
    .limit(10)
    .all();

  // Time distributions
  const hourOfDay = getTimeDistribution(accountId, '%H', 24);
  const dayOfWeek = getTimeDistribution(accountId, '%w', 7);

  // Thread length buckets
  const bucketRows = db
    .select({
      label: sql<string>`CASE
        WHEN ${threads.messageCount} = 1 THEN '1 msg'
        WHEN ${threads.messageCount} BETWEEN 2 AND 3 THEN '2-3'
        WHEN ${threads.messageCount} BETWEEN 4 AND 6 THEN '4-6'
        ELSE '7+'
      END`.as('label'),
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(threads)
    .where(eq(threads.accountId, accountId))
    .groupBy(sql`label`)
    .all();

  const bucketOrder = ['1 msg', '2-3', '4-6', '7+'];
  const buckets: ThreadLengthBucket[] = bucketOrder.map((label) => ({
    label,
    count: bucketRows.find((r) => r.label === label)?.count ?? 0,
  }));

  // Thread length average and median (computed in SQL to avoid loading all rows)
  const threadAgg = db
    .select({
      avg: sql<number>`AVG(${threads.messageCount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(threads)
    .where(eq(threads.accountId, accountId))
    .get();

  const threadCount = threadAgg?.count ?? 0;
  const average = threadAgg?.avg ?? 0;

  let median = 0;
  if (threadCount > 0) {
    const midOffset = Math.floor((threadCount - 1) / 2);
    const midRows = db
      .select({ messageCount: threads.messageCount })
      .from(threads)
      .where(eq(threads.accountId, accountId))
      .orderBy(threads.messageCount)
      .limit(threadCount % 2 === 0 ? 2 : 1)
      .offset(midOffset)
      .all();
    median =
      midRows.length === 2
        ? (midRows[0].messageCount + midRows[1].messageCount) / 2
        : (midRows[0]?.messageCount ?? 0);
  }

  // Totals
  const totals = db
    .select({
      totalSent: sql<number>`SUM(CASE WHEN ${messages.fromEmail} = ${lowerUser} THEN 1 ELSE 0 END)`,
      totalReceived: sql<number>`SUM(CASE WHEN ${messages.fromEmail} != ${lowerUser} THEN 1 ELSE 0 END)`,
      totalMessages: sql<number>`COUNT(*)`,
    })
    .from(messages)
    .where(eq(messages.accountId, accountId))
    .get();

  // Volume & classification stats
  const volumeStats = db
    .select({
      totalSize: sql<number>`SUM(COALESCE(${messages.sizeEstimate}, 0))`,
      avgSize: sql<number>`AVG(CASE WHEN ${messages.sizeEstimate} IS NOT NULL THEN ${messages.sizeEstimate} END)`,
      newsletterCount: sql<number>`SUM(CASE WHEN COALESCE(${messages.isNewsletter}, 0) = 1 THEN 1 ELSE 0 END)`,
      autoReplyCount: sql<number>`SUM(CASE WHEN COALESCE(${messages.isAutoReply}, 0) = 1 THEN 1 ELSE 0 END)`,
    })
    .from(messages)
    .where(eq(messages.accountId, accountId))
    .get();

  // Build ContactStats arrays
  const senderStats = topSenders.map((s) =>
    buildContactStats(s.email, s.name, 0, s.receivedCount),
  );
  const recipientStats = topRecipients.map((r) =>
    buildContactStats(r.email, r.name, r.sentCount, 0),
  );

  return {
    topSenders: senderStats,
    topRecipients: recipientStats,
    timeDistribution: { hourOfDay, dayOfWeek },
    threadLengths: { buckets, average, median },
    totalSent: totals?.totalSent ?? 0,
    totalReceived: totals?.totalReceived ?? 0,
    computedAt: new Date().toISOString(),
    threadCount,
    messageCount: totals?.totalMessages ?? 0,
    isComplete: true,
    totalSizeBytes: volumeStats?.totalSize ?? 0,
    avgMessageSizeBytes: volumeStats?.avgSize ?? 0,
    newsletterCount: volumeStats?.newsletterCount ?? 0,
    autoReplyCount: volumeStats?.autoReplyCount ?? 0,
  };
}
