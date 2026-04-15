import type { QuickFilters } from '@/src/features/search';
import type { EmailLabel } from '@/src/shared/types';
import { QUICK_FILTERS, TIME_RANGES } from './useSearchFilters';

export function buildActiveFilterSummary(
  filters: QuickFilters,
  labelList?: EmailLabel[],
): string[] {
  const active: string[] = [];
  for (const f of QUICK_FILTERS) {
    if (filters[f.key]) active.push(f.label);
  }
  if (filters.timeRange) {
    const t = TIME_RANGES.find((r) => r.key === filters.timeRange);
    if (t) active.push(t.label);
  }
  if (filters.labelIds?.length) {
    const names = filters.labelIds
      .map((id) => labelList?.find((l) => l.id === id)?.name)
      .filter(Boolean);
    active.push(...(names as string[]));
  }
  return active;
}
