import type { EmailThread } from '@/src/shared/types';
import type { GenerateFn } from './services/reranker';
import type { QuickFilters, SearchResult } from '@/src/shared/types/search';

export type { QuickFilters, SearchResult } from '@/src/shared/types/search';

/** Full search parameters */
export interface SearchParams {
  query: string;
  filters: QuickFilters;
  importanceMap?: Map<string, number>;
  /** When true, search falls back to Gmail API instead of local FTS. */
  useGmailApi?: boolean;
  /** Injected AI generate function for reranking — avoids cross-feature import. */
  generateFn?: GenerateFn;
}

/** Internal FTS match row */
export interface FTSMatch {
  threadId: string;
  rank: number;
}
