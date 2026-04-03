import { useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import EmailComponent from '../EmailComponent';
import { threadToEmailProps } from '@/lib/threadTransform';
import type { SearchResult } from '@/features/search/types';

interface SearchResultsProps {
  results: SearchResult[];
  hasQuery: boolean;
  isLoading: boolean;
  useGmailApi: boolean;
  importanceMap?: Map<string, number>;
  onThreadPress: (id: string) => void;
}

export default function SearchResults({
  results,
  hasQuery,
  isLoading,
  useGmailApi,
  importanceMap,
  onThreadPress,
}: SearchResultsProps) {
  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <EmailComponent
        id={item.thread.id}
        item={threadToEmailProps(item.thread, importanceMap)}
        onPress={onThreadPress}
      />
    ),
    [importanceMap, onThreadPress],
  );

  if (isLoading) {
    return (
      <View className="items-center justify-center py-8">
        <ActivityIndicator color="white" />
        <Text className="mt-2 text-xs text-gray-500">
          {useGmailApi ? 'Searching Gmail...' : 'AI analyzing results...'}
        </Text>
      </View>
    );
  }

  if (hasQuery && results.length === 0) {
    return (
      <View className="items-center justify-center py-8">
        <Text className="text-gray-500">No results</Text>
      </View>
    );
  }

  if (hasQuery) {
    return (
      <>
        <Text className="mb-2 text-xs text-gray-500">
          {results.length} {results.length === 1 ? 'result' : 'results'}
          {!useGmailApi ? ' • AI ✨' : ''}
          {useGmailApi ? ' • ☁️ Gmail' : ''}
        </Text>
        <FlashList
          data={results}
          keyExtractor={(item: SearchResult) => item.thread.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      </>
    );
  }

  return (
    <View className="items-center justify-center py-8">
      <Text className="text-sm text-gray-600">Type to search</Text>
    </View>
  );
}
