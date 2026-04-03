import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import type { QuickFilters } from '@/features/search';
import type { EmailLabel } from '@/types';
import FilterChip from './FilterChip';
import {
  QUICK_FILTERS,
  TIME_RANGES,
  type BooleanFilterKey,
} from './useSearchFilters';

interface SearchFiltersProps {
  filters: QuickFilters;
  expanded: boolean;
  onToggleExpanded: () => void;
  activeFilterCount: number;
  useGmailApi: boolean;
  labelList: EmailLabel[] | undefined;
  onToggleFilter: (key: BooleanFilterKey) => void;
  onSetTimeRange: (range: QuickFilters['timeRange']) => void;
  onToggleLabel: (labelId: string) => void;
}

export default function SearchFilters({
  filters,
  expanded,
  onToggleExpanded,
  activeFilterCount,
  useGmailApi,
  labelList,
  onToggleFilter,
  onSetTimeRange,
  onToggleLabel,
}: SearchFiltersProps) {
  // Build active filter summary chips (shown when collapsed)
  const activeFilterSummary = useMemo(() => {
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
  }, [filters, labelList]);

  return (
    <View>
      {/* Filters header — toggle expand/collapse */}
      <Pressable
        className="mb-2 flex-row items-center justify-between"
        onPress={onToggleExpanded}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-medium text-gray-400">Filters</Text>
          {activeFilterCount > 0 && (
            <View className="rounded-full bg-indigo-500 px-2 py-0.5">
              <Text className="text-[10px] font-bold text-white">
                {activeFilterCount}
              </Text>
            </View>
          )}
        </View>
        <Icon
          name={expanded ? 'arrow-up' : 'arrow-down'}
          size={12}
          color="#6b7280"
        />
      </Pressable>

      {/* Active filter chips (shown when collapsed) */}
      {!expanded && (
        <View className="mb-3">
          {activeFilterSummary.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2">
                {activeFilterSummary.map((label) => (
                  <View
                    key={label}
                    className="flex-row items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1.5"
                  >
                    <View className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    <Text className="text-xs font-medium text-indigo-300">
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text className="text-xs text-gray-600">No filters</Text>
          )}
        </View>
      )}

      {/* Expanded filters panel */}
      {expanded && (
        <ScrollView
          className="mb-3 max-h-64"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Boolean filters */}
          <View className="mb-3 flex-row flex-wrap gap-2">
            {QUICK_FILTERS.filter(
              (f) => !(useGmailApi && f.key === 'isAutoReply'),
            ).map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active={!!filters[f.key]}
                onPress={() => onToggleFilter(f.key)}
                icon={'icon' in f ? (f.icon as string) : undefined}
              />
            ))}
          </View>

          {/* Time range */}
          <Text className="mb-1.5 text-xs text-gray-500">Period</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {TIME_RANGES.map((t) => (
              <FilterChip
                key={t.key}
                label={t.label}
                active={filters.timeRange === t.key}
                onPress={() => onSetTimeRange(t.key)}
              />
            ))}
          </View>

          {/* Labels */}
          {labelList && labelList.length > 0 && (
            <>
              <Text className="mb-1.5 text-xs text-gray-500">Labels</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-3"
              >
                <View className="flex-row gap-2">
                  {labelList.map((label) => (
                    <FilterChip
                      key={label.id}
                      label={label.name}
                      active={filters.labelIds?.includes(label.id) ?? false}
                      onPress={() => onToggleLabel(label.id)}
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
