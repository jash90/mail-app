import { db } from '../client';
import { summaryCache } from '../schema';
import { and, eq, gt, inArray } from 'drizzle-orm';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Get a cached summary if it exists and is less than 24h old. */
export function getSummaryCache(key: string): string | null {
  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const row = db
    .select({ summary: summaryCache.summary })
    .from(summaryCache)
    .where(and(eq(summaryCache.key, key), gt(summaryCache.createdAt, cutoff)))
    .get();
  return row?.summary ?? null;
}

/** Get cached summaries for multiple keys. Only returns entries less than 24h old. */
export function getSummaryCacheBatch(keys: string[]): Map<string, string> {
  if (!keys.length) return new Map();
  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const rows = db
    .select({ key: summaryCache.key, summary: summaryCache.summary })
    .from(summaryCache)
    .where(
      and(inArray(summaryCache.key, keys), gt(summaryCache.createdAt, cutoff)),
    )
    .all();
  return new Map(rows.map((r) => [r.key, r.summary]));
}

/** Upsert a summary cache entry. */
export function setSummaryCache(key: string, summary: string): void {
  const now = new Date().toISOString();
  db.insert(summaryCache)
    .values({ key, summary, createdAt: now })
    .onConflictDoUpdate({
      target: summaryCache.key,
      set: { summary, createdAt: now },
    })
    .run();
}

/** Delete all summary cache entries. */
export function clearSummaryCache(): void {
  db.delete(summaryCache).run();
}
