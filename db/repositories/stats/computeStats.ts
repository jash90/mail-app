import type {
  ContactStats,
  EmailStats,
  ThreadLengthBucket,
} from '@/features/stats/types';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../client';
import { messageRecipients, messages, participants, threads } from '../../schema';
import { getTimeDistribution, buildContactStats } from './helpers';

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
