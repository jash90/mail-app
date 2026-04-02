import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import EmailComponent from './EmailComponent';
import { useLabels, useSearchThreads } from '@/features/gmail';
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
  { key: 'week', label: '7 dni' },
  { key: 'month', label: 'Miesiąc' },
  { key: 'year', label: 'Rok' },
  { key: 'all', label: 'Wszystko' },
] as const;

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
  const [useAI, setUseAI] = useState(false);

  // Build search params
  const searchParams = useMemo<SearchParams>(
    () => ({ query: debouncedQuery, filters, useAI }),
    [debouncedQuery, filters, useAI],
  );

  const {
    data: results,
    isLoading,
    isFetching,
  } = useSearchThreads(accountId, searchParams);
  const { data: labelList } = useLabels(accountId) as {
    data: EmailLabel[] | undefined;
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setDebouncedQuery('');
      setFilters({});
      setUseAI(false);
    }
  }, [visible]);

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
  const hasQuery = debouncedQuery.length >= 2;

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
          <Text className="text-lg font-semibold text-white">Szukaj</Text>
          <View className="w-5" />
        </View>

        {/* Search Input */}
        <View className="mb-4 flex-row items-center rounded-xl bg-white/10 px-4 py-3">
          <Icon name="magnifier" size={16} color="#9ca3af" />
          <TextInput
            ref={inputRef}
            className="ml-3 flex-1 text-base text-white"
            placeholder="np. faktura od kowalskiego..."
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

        {/* Quick Filters */}
        <ScrollView
          className="mb-3 max-h-72"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Boolean filters */}
          <View className="mb-3 flex-row flex-wrap gap-2">
            <FilterChip
              label="Nieprzeczytane"
              active={!!filters.isUnread}
              onPress={() => toggleFilter('isUnread')}
            />
            <FilterChip
              label="⭐ Oznaczone"
              active={!!filters.isStarred}
              onPress={() => toggleFilter('isStarred')}
            />
            <FilterChip
              label="Newsletter"
              active={!!filters.isNewsletter}
              onPress={() => toggleFilter('isNewsletter')}
            />
            <FilterChip
              label="Auto-reply"
              active={!!filters.isAutoReply}
              onPress={() => toggleFilter('isAutoReply')}
            />
          </View>

          {/* Time range */}
          <Text className="mb-1.5 text-xs text-gray-500">Okres</Text>
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

          {/* AI toggle */}
          <View className="flex-row items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm">🤖</Text>
              <Text className="text-sm text-white">Smart ranking</Text>
            </View>
            <Switch
              value={useAI}
              onValueChange={setUseAI}
              trackColor={{ false: '#374151', true: '#818cf8' }}
              thumbColor="white"
            />
          </View>
        </ScrollView>

        {/* Results */}
        <View className="flex-1">
          {isLoading || isFetching ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator color="white" />
              {useAI && (
                <Text className="mt-2 text-xs text-gray-500">
                  AI analizuje wyniki...
                </Text>
              )}
            </View>
          ) : hasQuery && threads.length === 0 ? (
            <View className="items-center justify-center py-8">
              <Text className="text-gray-500">Brak wyników</Text>
            </View>
          ) : hasQuery ? (
            <>
              <Text className="mb-2 text-xs text-gray-500">
                {threads.length} {threads.length === 1 ? 'wynik' : 'wyników'}
                {useAI ? ' • AI ✨' : ''}
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
              <Text className="text-sm text-gray-600">
                Wpisz frazę aby wyszukać
              </Text>
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
