import { Sentry } from '@/src/shared/services/sentry';

/**
 * Measure an async operation with Sentry performance monitoring.
 * Creates a span under the active transaction (or standalone if none).
 *
 * Usage:
 *   const result = await measure('sync.full', 'Full Gmail sync', () => performFullSync(id));
 */
export async function measure<T>(
  op: string,
  description: string,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan({ op, name: description }, async () => fn());
}

/**
 * Measure a synchronous operation.
 */
export function measureSync<T>(
  op: string,
  description: string,
  fn: () => T,
): T {
  return Sentry.startSpan({ op, name: description }, () => fn());
}
