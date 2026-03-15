import { getUnreadThreads } from '@/db/repositories/threads';
import { getSummaryCache, summarizeEmail } from '@/features/ai/api';
import { useAuthStore } from '@/store/authStore';
import type { EmailThread } from '@/types';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

const listContentStyle = { paddingHorizontal: 16, paddingBottom: 32 } as const;

interface SummaryItem {
  thread: EmailThread;
  summary: string | null;
  loading: boolean;
  error: string | null;
}

const SummaryItemRow = memo(function SummaryItemRow({
  item,
  index,
  onRetry,
}: {
  item: SummaryItem;
  index: number;
  onRetry: (index: number, item: SummaryItem) => void;
}) {
  return (
    <View className="mb-3 rounded-xl bg-zinc-900 p-4">
      <Text className="text-sm font-semibold text-indigo-400" numberOfLines={1}>
        {item.thread.participants[0]?.name ||
          item.thread.participants[0]?.email ||
          'Unknown'}
      </Text>
      <Text className="mt-1 text-base font-medium text-white" numberOfLines={2}>
        {item.thread.subject}
      </Text>

      {item.loading ? (
        <ActivityIndicator
          className="mt-3 self-start"
          size="small"
          color="#818cf8"
        />
      ) : item.error ? (
        <View className="mt-2 flex-row items-center gap-3">
          <Text className="flex-1 text-sm text-red-400">
            Error: {item.error}
          </Text>
          <TouchableOpacity
            onPress={() => onRetry(index, item)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-zinc-300">
          {item.summary}
        </Text>
      )}
    </View>
  );
});

export default function SummaryScreen() {
  const router = useRouter();
  const accountId = useAuthStore((s) => s.user?.id) ?? '';
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [processed, setProcessed] = useState(0);
  const cancelledRef = useRef(false);
  const retryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    const abortController = new AbortController();
    const threads = getUnreadThreads(accountId, 20);

    if (threads.length === 0) {
      setItems([]);
      return;
    }

    const initialItems = threads.map((thread) => {
      const cached = getSummaryCache(thread.id);
      return {
        thread,
        summary: cached,
        loading: !cached,
        error: null,
      };
    });

    const cachedCount = initialItems.filter((item) => item.summary).length;
    setItems(initialItems);
    setProcessed(cachedCount);

    (async () => {
      for (let i = 0; i < threads.length; i++) {
        if (cancelledRef.current) break;
        if (initialItems[i].summary) continue;

        const t = threads[i];
        try {
          const summary = await summarizeEmail(
            t.id,
            t.subject,
            t.snippet,
            abortController.signal,
          );
          if (cancelledRef.current) break;
          setItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, summary, loading: false } : item,
            ),
          );
        } catch (err) {
          if (cancelledRef.current) break;
          console.warn(`[SummaryScreen] Failed to summarize thread ${t.id}`);
          setItems((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Unknown error',
                  }
                : item,
            ),
          );
        }
        setProcessed((prev) => prev + 1);
      }
    })();

    return () => {
      cancelledRef.current = true;
      abortController.abort();
      retryAbortRef.current?.abort();
    };
  }, [accountId]);

  const retrySummary = useCallback(async (index: number, item: SummaryItem) => {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === index ? { ...it, loading: true, error: null } : it,
      ),
    );

    const abort = new AbortController();
    retryAbortRef.current = abort;

    try {
      const summary = await summarizeEmail(
        item.thread.id,
        item.thread.subject,
        item.thread.snippet,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setItems((p) =>
        p.map((it, idx) =>
          idx === index ? { ...it, summary, loading: false } : it,
        ),
      );
    } catch (err) {
      if (abort.signal.aborted) return;
      console.warn(`[SummaryScreen] Retry failed for thread ${item.thread.id}`);
      setItems((p) =>
        p.map((it, idx) =>
          idx === index
            ? {
                ...it,
                loading: false,
                error: err instanceof Error ? err.message : 'Unknown error',
              }
            : it,
        ),
      );
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: SummaryItem; index: number }) => (
      <SummaryItemRow item={item} index={index} onRetry={retrySummary} />
    ),
    [retrySummary],
  );

  const total = items.length;

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <View className="flex-row items-center gap-4 p-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-white">AI Summary</Text>
      </View>

      {total === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg text-zinc-400">No unread emails</Text>
        </View>
      ) : (
        <>
          <Text className="px-4 pb-2 text-sm text-zinc-400">
            {processed < total
              ? `Summarizing ${processed + 1} of ${total}...`
              : `All ${total} emails summarized`}
          </Text>

          <FlatList
            data={items}
            keyExtractor={(item) => item.thread.id}
            contentContainerStyle={listContentStyle}
            renderItem={renderItem}
          />
        </>
      )}
    </StyledSafeAreaView>
  );
}
