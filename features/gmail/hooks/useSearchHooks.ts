import { useQuery } from '@tanstack/react-query';
import type { SearchParams, SearchResult } from '@/features/search';
import { hybridSearch } from '@/features/search';
import { gmailKeys } from '../queryKeys';
import { searchContacts } from '../contacts';
import { getContactImportanceMap } from '@/db/repositories/stats';

const THIRTY_MINUTES = 30 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/** Contact importance tiers (1-5) based on email exchange history. */
export const useContactImportance = (accountId: string, userEmail: string) =>
  useQuery({
    queryKey: ['contact-importance', accountId],
    queryFn: () => getContactImportanceMap(accountId, userEmail),
    enabled: !!accountId && !!userEmail,
    staleTime: THIRTY_MINUTES,
  });

/** Hybrid search: FTS5 + quick filters + AI reranking with contact stats. */
export const useSearchThreads = (accountId: string, params: SearchParams) =>
  useQuery<SearchResult[]>({
    queryKey: gmailKeys.search(accountId, params.query, {
      ...(params.filters as Record<string, unknown>),
      useGmailApi: params.useGmailApi,
    }),
    queryFn: () => hybridSearch(accountId, params),
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
