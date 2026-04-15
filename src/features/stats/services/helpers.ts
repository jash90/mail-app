import type { ContactStats, StatsProgress } from '../types';

export function calculateEmailRatio(
  totalSent: number,
  totalReceived: number,
): string {
  if (totalSent > 0) return `1:${Math.round(totalReceived / totalSent)}`;
  if (totalReceived > 0) return `0:${totalReceived}`;
  return '-';
}

export function getProgressLabel(phase: StatsProgress['phase']): string {
  if (phase === 'listing') return 'Listing threads...';
  if (phase === 'retrying') return 'Retrying failed requests...';
  return 'Loading messages...';
}

export function getProgressValue(
  phase: StatsProgress['phase'],
  loaded: number,
  total: number,
): string {
  if (phase === 'listing') return `${loaded} found`;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  return `${loaded}/${total} (${pct}%)`;
}

export function getMaxContactValue(
  contacts: ContactStats[],
  valueKey: 'totalCount' | 'receivedCount' | 'sentCount',
): number {
  return Math.max(...contacts.map((c) => c[valueKey] ?? c.totalCount));
}
