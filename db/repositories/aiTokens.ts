import { db } from '@/db/client';
import { aiTokenUsage } from '@/db/schema';
import { sql, desc } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────

export interface TokenTotals {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface TokensByProvider {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface TokensByOperation {
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface TokensByDay {
  day: string;
  totalTokens: number;
  requestCount: number;
}

export interface RecentUsageEntry {
  id: number;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

// ── Queries ───────────────────────────────────────────────────────────

export function getTokenTotals(): TokenTotals {
  const row = db
    .select({
      totalPromptTokens: sql<number>`coalesce(sum(${aiTokenUsage.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`coalesce(sum(${aiTokenUsage.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(aiTokenUsage)
    .get();

  return (
    row ?? {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      requestCount: 0,
    }
  );
}

export function getTokensByProvider(): TokensByProvider[] {
  return db
    .select({
      provider: aiTokenUsage.provider,
      model: aiTokenUsage.model,
      promptTokens: sql<number>`coalesce(sum(${aiTokenUsage.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${aiTokenUsage.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(aiTokenUsage)
    .groupBy(aiTokenUsage.provider, aiTokenUsage.model)
    .orderBy(sql`sum(${aiTokenUsage.totalTokens}) DESC`)
    .all();
}

export function getTokensByOperation(): TokensByOperation[] {
  return db
    .select({
      operation: aiTokenUsage.operation,
      promptTokens: sql<number>`coalesce(sum(${aiTokenUsage.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${aiTokenUsage.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(aiTokenUsage)
    .groupBy(aiTokenUsage.operation)
    .orderBy(sql`sum(${aiTokenUsage.totalTokens}) DESC`)
    .all();
}

export function getTokensByDay(limit = 30): TokensByDay[] {
  return db
    .select({
      day: sql<string>`date(${aiTokenUsage.createdAt})`,
      totalTokens: sql<number>`coalesce(sum(${aiTokenUsage.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(aiTokenUsage)
    .groupBy(sql`date(${aiTokenUsage.createdAt})`)
    .orderBy(desc(sql`date(${aiTokenUsage.createdAt})`))
    .limit(limit)
    .all();
}

export function getRecentUsage(limit = 50): RecentUsageEntry[] {
  return db
    .select({
      id: aiTokenUsage.id,
      provider: aiTokenUsage.provider,
      model: aiTokenUsage.model,
      operation: aiTokenUsage.operation,
      promptTokens: aiTokenUsage.promptTokens,
      completionTokens: aiTokenUsage.completionTokens,
      totalTokens: aiTokenUsage.totalTokens,
      createdAt: aiTokenUsage.createdAt,
    })
    .from(aiTokenUsage)
    .orderBy(desc(aiTokenUsage.createdAt))
    .limit(limit)
    .all();
}

export function clearTokenUsage(): void {
  db.delete(aiTokenUsage).run();
}
