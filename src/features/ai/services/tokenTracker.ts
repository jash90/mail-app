export const TOKEN_TRACKING_ENABLED =
  process.env.EXPO_PUBLIC_AI_TOKEN_TRACKING === 'true';

export type AiOperation = 'compose' | 'reply' | 'summary' | 'rerank';

export interface TokenUsageEntry {
  provider: string;
  model: string;
  operation: AiOperation;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Record AI token usage into SQLite.
 * No-op when tracking is disabled.
 * Uses lazy import to avoid pulling db/client at module load.
 */
export function recordTokenUsage(entry: TokenUsageEntry): void {
  if (!TOKEN_TRACKING_ENABLED) return;

  try {
    // Lazy require to avoid db import in test/module-load context
    const { db } =
      require('@/src/shared/db/client') as typeof import('@/src/shared/db/client');
    const { aiTokenUsage } =
      require('@/src/shared/db/schema') as typeof import('@/src/shared/db/schema');

    db.insert(aiTokenUsage)
      .values({
        provider: entry.provider,
        model: entry.model,
        operation: entry.operation,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.totalTokens,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (e) {
    if (__DEV__) console.warn('[tokenTracker] Failed to record usage:', e);
  }
}

/**
 * Estimate token count from text (rough ~4 chars per token for English).
 * Used as fallback when API doesn't return usage info.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
