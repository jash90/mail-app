import { db } from '../../client';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { threads } from '../../schema';
import type { FTSMatch } from '@/src/features/search';

/**
 * FTS5 full-text search with BM25 ranking.
 * Searches across: subject, snippet, from_name, from_email, to_emails, label_names.
 */
export function searchFTS(query: string, limit: number = 50): FTSMatch[] {
  if (!query || query.trim().length < 3) return [];

  const sanitized = sanitizeFTSQuery(query);
  if (!sanitized) return [];

  try {
    const rows = db.all<{ thread_id: string; rank: number }>(
      sql`SELECT thread_id, rank FROM email_fts WHERE email_fts MATCH ${sanitized} ORDER BY rank LIMIT ${limit}`,
    );

    return rows.map((r) => ({ threadId: r.thread_id, rank: r.rank }));
  } catch (e) {
    console.warn('[searchFTS] FTS query failed:', e);
    return [];
  }
}

/** Check if FTS index has any data. */
export function isFTSIndexEmpty(): boolean {
  try {
    const row = db.get<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM email_fts`,
    );
    return (row?.cnt ?? 0) === 0;
  } catch {
    return true;
  }
}

/** Get local thread count for an account. */
export function getLocalThreadCount(accountId: string): number {
  const row = db.get<{ cnt: number }>(
    sql`SELECT COUNT(*) as cnt FROM ${threads} WHERE ${threads.accountId} = ${accountId}`,
  );
  return row?.cnt ?? 0;
}

/**
 * Sanitize user input for FTS5 MATCH syntax.
 * Converts "faktura kowalski" → "faktura* kowalski*" (prefix search).
 */
export function sanitizeFTSQuery(input: string): string {
  const tokens = input
    .trim()
    .replace(/['"()*:^~]/g, '') // strip FTS5 special chars
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return '';

  return tokens.map((t) => `"${t}"*`).join(' ');
}
