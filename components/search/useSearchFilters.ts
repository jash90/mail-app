import { useCallback, useMemo, useState } from 'react';
import type { QuickFilters } from '@/features/search';

export const TIME_RANGES = [
  { key: 'week', label: '7 days' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' },
] as const;

export const QUICK_FILTERS = [
  { key: 'isUnread' as const, label: 'Unread' },
  { key: 'isStarred' as const, label: '⭐ Starred' },
  { key: 'isNewsletter' as const, label: 'Newsletter' },
  { key: 'isAutoReply' as const, label: 'Auto-reply' },
];

export type BooleanFilterKey = keyof Pick<
  QuickFilters,
  'isUnread' | 'isStarred' | 'isNewsletter' | 'isAutoReply'
>;

export function useSearchFilters() {
  const [filters, setFilters] = useState<QuickFilters>({});

  const toggleFilter = useCallback((key: BooleanFilterKey) => {
    setFilters((prev) => ({ ...prev, [key]: prev[key] ? undefined : true }));
  }, []);

  const setTimeRange = useCallback((range: QuickFilters['timeRange']) => {
    setFilters((prev) => ({
      ...prev,
      timeRange: prev.timeRange === range ? undefined : range,
    }));
  }, []);

  const toggleLabel = useCallback((labelId: string) => {
    setFilters((prev) => {
      const current = prev.labelIds ?? [];
      const next = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId];
      return { ...prev, labelIds: next.length > 0 ? next : undefined };
    });
  }, []);

  const resetFilters = useCallback(() => setFilters({}), []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.isUnread) count++;
    if (filters.isStarred) count++;
    if (filters.isNewsletter) count++;
    if (filters.isAutoReply) count++;
    if (filters.timeRange) count++;
    if (filters.labelIds?.length) count += filters.labelIds.length;
    return count;
  }, [filters]);

  return {
    filters,
    toggleFilter,
    setTimeRange,
    toggleLabel,
    resetFilters,
    activeFilterCount,
  };
}
