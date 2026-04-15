import { gmailRequest } from './api';
import { mapGmailThreadToEmailThread } from '../threads';
import type { GmailThread } from '../types';
import { getLabels } from '@/src/shared/db/repositories/labels';
import type { QuickFilters, SearchResult } from '@/src/shared/types/search';

const MAX_RESULTS = 20;

/**
 * Convert QuickFilters to Gmail `q` operators.
 * @see https://support.google.com/mail/answer/7190
 */
function buildGmailQuery(
  textQuery: string,
  filters: QuickFilters,
  accountId: string,
): string {
  const parts: string[] = [textQuery];

  if (filters.isUnread) parts.push('is:unread');
  if (filters.isStarred) parts.push('is:starred');
  if (filters.isNewsletter) parts.push('category:promotions');
  // isAutoReply has no Gmail q equivalent — ignored server-side

  if (filters.timeRange && filters.timeRange !== 'all') {
    const timeMap = { week: '7d', month: '1m', year: '1y' } as const;
    parts.push(`newer_than:${timeMap[filters.timeRange]}`);
  }

  if (filters.labelIds?.length) {
    // Gmail q uses label names, not IDs — resolve from local DB
    const allLabels = getLabels(accountId);
    const labelMap = new Map(allLabels.map((l) => [l.id, l.name]));
    for (const id of filters.labelIds) {
      const name = labelMap.get(id);
      if (name) {
        parts.push(name.includes(' ') ? `label:"${name}"` : `label:${name}`);
      }
    }
  }

  return parts.join(' ');
}

const THREAD_METADATA_PARAMS =
  'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=List-Id&metadataHeaders=List-Unsubscribe&metadataHeaders=Auto-Submitted';

/**
 * Search via Gmail API — used when local FTS index is incomplete.
 * Uses Gmail's `q` parameter for server-side search.
 * Fetches each thread individually to always get fresh metadata.
 */
export async function searchViaGmailApi(
  accountId: string,
  query: string,
  filters: QuickFilters = {},
): Promise<SearchResult[]> {
  if (!query || query.trim().length < 3) return [];

  try {
    const gmailQuery = buildGmailQuery(query, filters, accountId);

    const params = new URLSearchParams({
      q: gmailQuery,
      maxResults: String(MAX_RESULTS),
    });

    const listResponse = await gmailRequest<{
      threads?: Array<{ id: string }>;
    }>(`/threads?${params}`);

    if (!listResponse.threads || listResponse.threads.length === 0) return [];

    // Fetch threads in parallel (always fresh, no stale-skip)
    const fetches = listResponse.threads.map(async ({ id }, i) => {
      try {
        const thread = await gmailRequest<GmailThread>(
          `/threads/${id}?${THREAD_METADATA_PARAMS}`,
        );
        const mapped = mapGmailThreadToEmailThread(accountId, thread);
        if (mapped) {
          return {
            thread: mapped,
            ftsScore: 0,
            finalScore: MAX_RESULTS - i,
          } as SearchResult;
        }
      } catch (e) {
        console.warn(`[gmailApiSearch] Failed to fetch thread ${id}:`, e);
      }
      return null;
    });

    const results = await Promise.all(fetches);
    return results.filter((r): r is SearchResult => r !== null);
  } catch (e) {
    console.warn('[gmailApiSearch] Gmail API search failed:', e);
    return [];
  }
}
