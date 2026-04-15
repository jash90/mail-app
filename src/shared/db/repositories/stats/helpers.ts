import type { ContactStats } from '@/src/features/stats/types';
import { sql, eq } from 'drizzle-orm';
import { db } from '../../client';
import { messages } from '../../schema';

/** Query time-based distribution (e.g. hour-of-day or day-of-week) for messages. */
export function getTimeDistribution(
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

export function buildContactStats(
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
