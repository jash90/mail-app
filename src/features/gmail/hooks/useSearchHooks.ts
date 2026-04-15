import { useQuery } from '@tanstack/react-query';
import type { SearchParams, SearchResult } from '@/src/features/search';
import { hybridSearch } from '@/src/features/search';
import type { GenerateFn } from '@/src/features/search';
import { gmailKeys } from '../services/queryKeys';
import { searchContacts } from '../services/contacts';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/** Hybrid search: FTS5 + quick filters + AI reranking with contact stats. */
export const useSearchThreads = (
  accountId: string,
  params: SearchParams,
  generateFn?: GenerateFn,
) =>
  useQuery<SearchResult[]>({
    queryKey: gmailKeys.search(accountId, params.query, {
      ...(params.filters as Record<string, unknown>),
      useGmailApi: params.useGmailApi,
    }),
    queryFn: () =>
      hybridSearch(accountId, {
        ...params,
        generateFn,
      }),
    enabled: !!accountId && params.query.length >= 3,
    staleTime: params.useGmailApi ? 60 * 1000 : 5 * 60 * 1000,
  });

export const useSearchContacts = (query: string) =>
  useQuery({
    queryKey: gmailKeys.contacts(query),
    queryFn: () => searchContacts(query),
    enabled: query.length >= 2,
    staleTime: TWENTY_FOUR_HOURS,
  });
