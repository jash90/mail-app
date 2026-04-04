import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  Text,
  Pressable,
  View,
  RefreshControl,
} from 'react-native';
import { calculateEmailRatio } from '@/features/stats/helpers';
import { useAuthStore } from '@/store/authStore';
import { useEmailStats } from '@/features/stats';
import StatCard from '@/components/stats/StatCard';
import ContactRankingList from '@/components/stats/ContactRankingList';
import TimeChart from '@/components/stats/TimeChart';
import ThreadLengthChart from '@/components/stats/ThreadLengthChart';
import ResponseTimeList from '@/components/stats/ResponseTimeList';
import ProgressOverlay from '@/components/stats/ProgressOverlay';
import { StatsSkeleton } from '@/components/skeletons';
import { StyledSafeAreaView } from '@/components/StyledSafeAreaView';

export default function StatsScreen() {
  const user = useAuthStore((s) => s.user);
  const accountId = user?.id ?? '';
  const {
    stats,
    fullStats,
    isLoadingFull,
    progress,
    error,
    failedCount,
    refetch,
    fetchFull,
  } = useEmailStats(accountId);

  const displayStats = fullStats ?? stats;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!accountId) return;
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [accountId, refetch]);

  if (!displayStats) {
    return (
      <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pt-4">
          <Text className="text-3xl font-bold text-white">Statistics</Text>
        </View>
        <StatsSkeleton />
      </StyledSafeAreaView>
    );
  }

  const ratio = calculateEmailRatio(
    displayStats.totalSent,
    displayStats.totalReceived,
  );

  return (
    <StyledSafeAreaView className="flex-1 bg-black" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="white"
          />
        }
      >
        <View className="flex-row items-center justify-between pt-4 pb-2">
          <Text className="text-3xl font-bold text-white">Statistics</Text>
          {!displayStats.isComplete && !isLoadingFull && (
            <View className="rounded-full bg-zinc-800 px-2 py-0.5">
              <Text className="text-[10px] text-zinc-400">Partial data</Text>
            </View>
          )}
        </View>

        <ProgressOverlay
          progress={progress}
          visible={isLoadingFull && !fullStats}
        />

        {error && !isLoadingFull && (
          <View className="mb-3 rounded-xl border border-red-900 bg-red-950/50 p-3">
            <Text className="mb-2 text-sm text-red-400">{error}</Text>
            <Pressable
              onPress={fetchFull}
              className="self-start rounded-lg bg-red-900/50 px-3 py-1.5"
            >
              <Text className="text-xs font-medium text-red-300">Retry</Text>
            </Pressable>
          </View>
        )}

        {!isLoadingFull && failedCount > 0 && displayStats && (
          <View className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/50 p-3">
            <Text className="text-xs text-amber-400">
              Stats based on {displayStats.threadCount.toLocaleString()} /{' '}
              {(
                displayStats.totalListedThreads ?? displayStats.threadCount
              ).toLocaleString()}{' '}
              threads ({failedCount.toLocaleString()} unavailable)
            </Text>
          </View>
        )}

        <View className="mb-1 flex-row gap-3">
          <StatCard
            icon="paper-plane"
            value={displayStats.totalSent}
            label="Sent"
          />
          <StatCard
            icon="envelope-open"
            value={displayStats.totalReceived}
            label="Received"
          />
          <StatCard icon="graph" value={ratio} label="Ratio" />
        </View>

        <View className="mt-1 flex-row gap-3">
          <StatCard
            icon="layers"
            value={displayStats.threadCount}
            label="Threads"
          />
          <StatCard
            icon="bubble"
            value={displayStats.messageCount}
            label="Messages"
          />
        </View>

        {(displayStats.newsletterCount != null ||
          displayStats.totalSizeBytes != null) && (
          <View className="mt-1 flex-row gap-3">
            {displayStats.newsletterCount != null && (
              <StatCard
                icon="notebook"
                value={displayStats.newsletterCount}
                label="Newsletters"
              />
            )}
            {displayStats.autoReplyCount != null && (
              <StatCard
                icon="action-redo"
                value={displayStats.autoReplyCount}
                label="Auto-replies"
              />
            )}
            {displayStats.avgMessageSizeBytes != null &&
              displayStats.avgMessageSizeBytes > 0 && (
                <StatCard
                  icon="disc"
                  value={`${Math.round(displayStats.avgMessageSizeBytes / 1024)}K`}
                  label="Avg size"
                />
              )}
          </View>
        )}

        <ContactRankingList
          title="Top Senders"
          contacts={displayStats.topSenders}
          valueKey={displayStats.isComplete ? 'receivedCount' : 'totalCount'}
        />

        {displayStats.isComplete && (
          <ContactRankingList
            title="Top Recipients"
            contacts={displayStats.topRecipients}
            valueKey="sentCount"
          />
        )}

        <TimeChart
          hourOfDay={displayStats.timeDistribution.hourOfDay}
          dayOfWeek={displayStats.timeDistribution.dayOfWeek}
        />

        <ThreadLengthChart
          buckets={displayStats.threadLengths.buckets}
          average={displayStats.threadLengths.average}
          median={displayStats.threadLengths.median}
        />

        {displayStats.isComplete && (
          <ResponseTimeList contacts={displayStats.topSenders} />
        )}
      </ScrollView>
    </StyledSafeAreaView>
  );
}
