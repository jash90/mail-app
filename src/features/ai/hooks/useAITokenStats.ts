import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getTokenTotals,
  getTokensByProvider,
  getTokensByOperation,
  getTokensByDay,
  getRecentUsage,
  clearTokenUsage,
  type TokenTotals,
  type TokensByProvider,
  type TokensByOperation,
  type TokensByDay,
  type RecentUsageEntry,
} from '@/src/shared/db/repositories/aiTokens';

export interface AITokenStats {
  totals: TokenTotals;
  byProvider: TokensByProvider[];
  byOperation: TokensByOperation[];
  byDay: TokensByDay[];
  recent: RecentUsageEntry[];
}

const EMPTY_STATS: AITokenStats = {
  totals: {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
  },
  byProvider: [],
  byOperation: [],
  byDay: [],
  recent: [],
};

export function useAITokenStats() {
  const [stats, setStats] = useState<AITokenStats>(EMPTY_STATS);

  const refresh = useCallback(() => {
    setStats({
      totals: getTokenTotals(),
      byProvider: getTokensByProvider(),
      byOperation: getTokensByOperation(),
      byDay: getTokensByDay(30),
      recent: getRecentUsage(50),
    });
  }, []);

  useFocusEffect(refresh);

  const reset = useCallback(() => {
    clearTokenUsage();
    setStats(EMPTY_STATS);
  }, []);

  return { stats, refresh, reset };
}
