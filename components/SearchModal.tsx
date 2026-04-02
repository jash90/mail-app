import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import EmailComponent from './EmailComponent';
import { useLabels, useSearchThreads, isSyncReady } from '@/features/gmail';
import { threadToEmailProps } from '@/lib/threadTransform';
import type {
  QuickFilters,
  SearchParams,
  SearchResult,
} from '@/features/search/types';
import type { EmailLabel } from '@/types';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  importanceMap?: Map<string, number>;
}

const TIME_RANGES = [
  { key: 'week', label: '7 days' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' },
] as const;

const QUICK_FILTERS = [
  { key: 'isUnread' as const, label: 'Unread' },
  { key: 'isStarred' as const, label: '⭐ Starred' },
  { key: 'isNewsletter' as const, label: 'Newsletter' },
  { key: 'isAutoReply' as const, label: 'Auto-reply' },
];

export default function SearchModal({
  visible,
  onClose,
  accountId,
  importanceMap,
}: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  // Query state with debounce
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Quick filters
  const [filters, setFilters] = useState<QuickFilters>({});
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Check if local data is sufficient for FTS search
  const syncReady = isSyncReady(accountId);
  const useGmailApi = !syncReady;

  // Build search params
  const searchParams = useMemo<SearchParams>(
    () => ({
      query: debouncedQuery,
      filters,
      importanceMap: useGmailApi ? undefined : importanceMap,
      useGmailApi,
    }),
    [debouncedQuery, filters, importanceMap, useGmailApi],
  );

  const {
    data: results,
    isLoading,
    isFetching,
  } = useSearchThreads(accountId, searchParams);
  const { data: labelList } = useLabels(accountId) as {
    data: EmailLabel[] | undefined;
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setFiltersExpanded(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setDebouncedQuery('');
      setFilters({});
      setFiltersExpanded(true);
    }
  }, [visible]);

  // Auto-collapse filters when user types >= 3 chars, re-expand when cleared
  useEffect(() => {
    setFiltersExpanded(query.length < 3);
  }, [query]);

  // Count active filters for the badge
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

  // Filter toggles
  const toggleFilter = useCallback(
    (
      key: keyof Pick<
        QuickFilters,
        'isUnread' | 'isStarred' | 'isNewsletter' | 'isAutoReply'
      >,
    ) => {
      setFilters((prev) => ({ ...prev, [key]: prev[key] ? undefined : true }));
    },
    [],
  );

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

  const handleThreadPress = useCallback(
    (id: string) => {
      onClose();
      router.push({ pathname: '/thread/[id]', params: { id } });
    },
    [onClose, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <EmailComponent
        id={item.thread.id}
        item={threadToEmailProps(item.thread, importanceMap)}
        onPress={handleThreadPress}
      />
    ),
    [importanceMap, handleThreadPress],
  );

  const threads = results ?? [];
  const hasQuery = debouncedQuery.length >= 3;

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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black px-4 pt-14">
        {/* Header */}
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable onPress={onClose} hitSlop={12}>
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text className="text-lg font-semibold text-white">Search</Text>
          <View className="w-5" />
        </View>

        {/* Search Input */}
        <View className="mb-3 flex-row items-center rounded-xl bg-white/10 px-4 py-3">
          <Icon name="magnifier" size={16} color="#9ca3af" />
          <TextInput
            ref={inputRef}
            className="ml-3 flex-1 text-base text-white"
            placeholder="e.g. invoice from john..."
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close" size={12} color="#9ca3af" />
            </Pressable>
          )}
        </View>

        {/* Gmail API mode indicator */}
        {useGmailApi && (
          <View className="mb-2 flex-row items-center gap-1.5 rounded-lg bg-indigo-500/15 px-2.5 py-1.5">
            <Text className="text-[10px]">☁️</Text>
            <Text className="text-[10px] text-indigo-400">Online search</Text>
          </View>
        )}

        {/* Filters header — toggle expand/collapse */}
        <Pressable
          className="mb-2 flex-row items-center justify-between"
          onPress={() => setFiltersExpanded((v) => !v)}
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
            name={filtersExpanded ? 'arrow-up' : 'arrow-down'}
            size={12}
            color="#6b7280"
          />
        </Pressable>

        {/* Active filter chips (shown when collapsed) */}
        {!filtersExpanded && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
          >
            <View className="flex-row items-center gap-2">
              {activeFilterSummary.length > 0 ? (
                activeFilterSummary.map((label) => (
                  <View
                    key={label}
                    className="flex-row items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1.5"
                  >
                    <View className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    <Text className="text-xs font-medium text-indigo-300">
                      {label}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-xs text-gray-600">No filters</Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* Expanded filters panel */}
        {filtersExpanded && (
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
                  onPress={() => toggleFilter(f.key)}
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
                  onPress={() => setTimeRange(t.key)}
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
                        onPress={() => toggleLabel(label.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </ScrollView>
        )}

        {/* Results */}
        <View className="flex-1">
          {isLoading || isFetching ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator color="white" />
              {!useGmailApi && (
                <Text className="mt-2 text-xs text-gray-500">
                  AI analyzing results...
                </Text>
              )}
              {useGmailApi && (
                <Text className="mt-2 text-xs text-gray-500">
                  Searching Gmail...
                </Text>
              )}
            </View>
          ) : hasQuery && threads.length === 0 ? (
            <View className="items-center justify-center py-8">
              <Text className="text-gray-500">No results</Text>
            </View>
          ) : hasQuery ? (
            <>
              <Text className="mb-2 text-xs text-gray-500">
                {threads.length} {threads.length === 1 ? 'result' : 'results'}
                {!useGmailApi ? ' • AI ✨' : ''}
                {useGmailApi ? ' • ☁️ Gmail' : ''}
              </Text>
              <FlashList
                data={threads}
                keyExtractor={(item: SearchResult) => item.thread.id}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
              />
            </>
          ) : (
            <View className="items-center justify-center py-8">
              <Text className="text-sm text-gray-600">Type to search</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Reusable filter chip (checkbox/radio style) */
function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3.5 py-1.5 ${
        active ? 'bg-white' : 'bg-white/10'
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          active ? 'text-black' : 'text-gray-300'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
