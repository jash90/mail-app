import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useLabels, useSearchThreads, isSyncReady } from '@/features/gmail';
import type { SearchParams } from '@/features/search';
import type { EmailLabel } from '@/types';
import SearchInput from './SearchInput';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';
import { useSearchFilters } from './useSearchFilters';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  importanceMap?: Map<string, number>;
}

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

  // Filters
  const {
    filters,
    toggleFilter,
    setTimeRange,
    toggleLabel,
    resetFilters,
    activeFilterCount,
  } = useSearchFilters();
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
      resetFilters();
      setFiltersExpanded(true);
    }
  }, [visible, resetFilters]);

  // Auto-collapse filters when user types >= 3 chars, re-expand when cleared
  useEffect(() => {
    setFiltersExpanded(query.length < 3);
  }, [query]);

  const handleThreadPress = useCallback(
    (id: string) => {
      onClose();
      router.push({ pathname: '/thread/[id]', params: { id } });
    },
    [onClose, router],
  );

  const threads = results ?? [];
  const hasQuery = debouncedQuery.length >= 3;

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

        <SearchInput ref={inputRef} value={query} onChangeText={setQuery} />

        {/* Gmail API mode indicator */}
        {useGmailApi && (
          <View className="mb-2 flex-row items-center gap-1.5 rounded-lg bg-indigo-500/15 px-2.5 py-1.5">
            <Text className="text-[10px]">☁️</Text>
            <Text className="text-[10px] text-indigo-400">Online search</Text>
          </View>
        )}

        <SearchFilters
          filters={filters}
          expanded={filtersExpanded}
          onToggleExpanded={() => setFiltersExpanded((v) => !v)}
          activeFilterCount={activeFilterCount}
          useGmailApi={useGmailApi}
          labelList={labelList}
          onToggleFilter={toggleFilter}
          onSetTimeRange={setTimeRange}
          onToggleLabel={toggleLabel}
        />

        <View className="flex-1">
          <SearchResults
            results={threads}
            hasQuery={hasQuery}
            isLoading={isLoading || isFetching}
            useGmailApi={useGmailApi}
            importanceMap={importanceMap}
            onThreadPress={handleThreadPress}
          />
        </View>
      </View>
    </Modal>
  );
}
