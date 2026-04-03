import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/SimpleLineIcons';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';
import { useAITokenStats } from '@/features/ai/hooks/useAITokenStats';
import type {
  TokensByProvider,
  TokensByOperation,
  TokensByDay,
  RecentUsageEntry,
} from '@/db/repositories/aiTokens';

// ── Helpers ───────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const OPERATION_LABELS: Record<string, string> = {
  compose: '✉️ Compose',
  reply: '↩️ Reply',
  summary: '📝 Summary',
  rerank: '🔀 Rerank',
};

const OPERATION_COLORS: Record<string, string> = {
  compose: 'bg-indigo-500/20',
  reply: 'bg-emerald-500/20',
  summary: 'bg-amber-500/20',
  rerank: 'bg-rose-500/20',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────

function TotalCard({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <View className="flex-1 items-center rounded-xl bg-zinc-900 p-3">
      <Icon name={icon as any} size={18} color="#a1a1aa" />
      <Text className="mt-1 text-lg font-bold text-white">{value}</Text>
      <Text className="text-xs text-zinc-400">{label}</Text>
    </View>
  );
}

function ProviderSection({ data }: { data: TokensByProvider[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        By Provider / Model
      </Text>
      {data.map((p) => (
        <View
          key={`${p.provider}-${p.model}`}
          className="mb-2 rounded-lg bg-zinc-900 p-3"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-medium text-white">
                {p.provider.toUpperCase()}
              </Text>
              <Text className="text-xs text-zinc-500" numberOfLines={1}>
                {p.model}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-sm font-bold text-indigo-400">
                {formatNumber(p.totalTokens)} tok
              </Text>
              <Text className="text-xs text-zinc-500">
                {p.requestCount} req
              </Text>
            </View>
          </View>
          <View className="mt-2 flex-row gap-3">
            <Text className="text-xs text-zinc-500">
              ⬆ {formatNumber(p.promptTokens)}
            </Text>
            <Text className="text-xs text-zinc-500">
              ⬇ {formatNumber(p.completionTokens)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function OperationSection({ data }: { data: TokensByOperation[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        By Operation
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {data.map((op) => (
          <View
            key={op.operation}
            className={`rounded-lg p-3 ${OPERATION_COLORS[op.operation] ?? 'bg-zinc-800'}`}
            style={{ minWidth: '47%' }}
          >
            <Text className="text-sm font-medium text-white">
              {OPERATION_LABELS[op.operation] ?? op.operation}
            </Text>
            <Text className="mt-1 text-lg font-bold text-white">
              {formatNumber(op.totalTokens)}
            </Text>
            <Text className="text-xs text-zinc-400">
              {op.requestCount} requests
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DailyChart({ data }: { data: TokensByDay[] }) {
  if (data.length === 0) return null;
  const sorted = [...data].reverse();
  const maxTokens = Math.max(...sorted.map((d) => d.totalTokens), 1);

  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        Daily Usage (last 30 days)
      </Text>
      <View className="rounded-lg bg-zinc-900 p-3">
        <View className="flex-row items-end gap-1" style={{ height: 100 }}>
          {sorted.map((d) => {
            const h = Math.max((d.totalTokens / maxTokens) * 80, 2);
            return (
              <View key={d.day} className="flex-1 items-center">
                <View
                  className="w-full rounded-t bg-indigo-500"
                  style={{ height: h }}
                />
              </View>
            );
          })}
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-xs text-zinc-600">
            {sorted[0]?.day ? formatDate(sorted[0].day) : ''}
          </Text>
          <Text className="text-xs text-zinc-600">
            {sorted[sorted.length - 1]?.day
              ? formatDate(sorted[sorted.length - 1].day)
              : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

function RecentList({ data }: { data: RecentUsageEntry[] }) {
  if (data.length === 0) return null;
  return (
    <View className="mt-4 pb-8">
      <Text className="mb-2 text-sm font-semibold text-zinc-300">
        Recent Requests
      </Text>
      {data.slice(0, 20).map((entry) => (
        <View
          key={entry.id}
          className="mb-1 flex-row items-center rounded-lg bg-zinc-900 px-3 py-2"
        >
          <Text className="mr-2 text-xs">
            {OPERATION_LABELS[entry.operation]?.charAt(0) ?? '🤖'}
          </Text>
          <View className="flex-1">
            <Text className="text-xs text-white" numberOfLines={1}>
              {entry.model}
            </Text>
            <Text className="text-xs text-zinc-500">
              {formatDate(entry.createdAt)} {formatTime(entry.createdAt)} · ⬆{' '}
              {entry.promptTokens} ⬇ {entry.completionTokens}
            </Text>
          </View>
          <Text className="text-xs font-bold text-indigo-400">
            {formatNumber(entry.totalTokens)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────

export default function AITokensScreen() {
  const { stats, reset } = useAITokenStats();

  const handleReset = useCallback(() => {
    Alert.alert(
      'Clear Token Stats',
      'This will permanently delete all AI token usage history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: reset },
      ],
    );
  }, [reset]);

  const isEmpty = stats.totals.requestCount === 0;

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <ScrollView className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-2 pb-3">
          <Text className="text-3xl font-bold text-white">AI Tokens</Text>
          {!isEmpty && (
            <Pressable
              className="rounded-lg bg-zinc-800 px-3 py-1.5"
              onPress={handleReset}
            >
              <Text className="text-xs text-red-400">Clear</Text>
            </Pressable>
          )}
        </View>

        {isEmpty ? (
          <View className="items-center py-16">
            <Icon name="energy" size={40} color="#3f3f46" />
            <Text className="mt-4 text-base text-zinc-500">
              No AI usage recorded yet
            </Text>
            <Text className="mt-1 text-xs text-zinc-600">
              Token stats will appear here after AI calls
            </Text>
          </View>
        ) : (
          <>
            {/* Totals */}
            <View className="flex-row gap-2">
              <TotalCard
                icon="energy"
                value={formatNumber(stats.totals.totalTokens)}
                label="Total tokens"
              />
              <TotalCard
                icon="arrow-up"
                value={formatNumber(stats.totals.totalPromptTokens)}
                label="Prompt"
              />
              <TotalCard
                icon="arrow-down"
                value={formatNumber(stats.totals.totalCompletionTokens)}
                label="Completion"
              />
              <TotalCard
                icon="loop"
                value={String(stats.totals.requestCount)}
                label="Requests"
              />
            </View>

            <OperationSection data={stats.byOperation} />
            <ProviderSection data={stats.byProvider} />
            <DailyChart data={stats.byDay} />
            <RecentList data={stats.recent} />
          </>
        )}
      </ScrollView>
    </StyledSafeAreaView>
  );
}
