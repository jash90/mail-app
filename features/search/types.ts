import type { EmailThread } from '@/types';

/** Quick filter checkboxes — fast narrowing without typing */
export interface QuickFilters {
  isUnread?: boolean;
  isStarred?: boolean;
  isNewsletter?: boolean;
  isAutoReply?: boolean;
  timeRange?: 'week' | 'month' | 'year' | 'all';
  labelIds?: string[];
}

/** Full search parameters */
export interface SearchParams {
  query: string;
  filters: QuickFilters;
  useAI: boolean;
}

/** Single search result with scoring */
export interface SearchResult {
  thread: EmailThread;
  ftsScore: number;
  aiScore?: number;
  finalScore: number;
}

/** Internal FTS match row */
export interface FTSMatch {
  threadId: string;
  rank: number;
}
