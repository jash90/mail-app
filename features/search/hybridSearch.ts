import {
  searchFTS,
  isFTSIndexEmpty,
  rebuildFTSIndex,
} from '@/db/repositories/search';
import { searchThreadsWithFilters } from '@/db/repositories/threads';
import type { SearchParams, SearchResult } from './types';
import { rerankCandidates } from './reranker';
import { searchViaGmailApi } from './gmailApiSearch';

const FTS_CANDIDATE_LIMIT = 50;
const FINAL_RESULT_LIMIT = 20;

/** Module-level flag to avoid checking FTS emptiness on every search. */
let ftsIndexVerified = false;

/** Reset the FTS verification flag (call after sync rebuild). */
export function resetFTSVerification() {
  ftsIndexVerified = false;
}

/**
 * Hybrid search pipeline:
 * 1. FTS5 preselekcja — BM25 ranked candidates
 * 2. Quick filters — SQL WHERE narrowing
 * 3. AI reranking — optional semantic relevance scoring
 */
export async function hybridSearch(
  accountId: string,
  params: SearchParams,
): Promise<SearchResult[]> {
  // Gmail API fallback when local data is incomplete
  if (params.useGmailApi) {
    return searchViaGmailApi(accountId, params.query, params.filters);
  }

  // Step 0: Ensure FTS index is populated (lazy rebuild if empty, checked once)
  if (!ftsIndexVerified) {
    if (isFTSIndexEmpty()) {
      rebuildFTSIndex(accountId);
    }
    ftsIndexVerified = true;
  }

  // Step 1: FTS5 full-text search
  const ftsResults = searchFTS(params.query, FTS_CANDIDATE_LIMIT);

  if (ftsResults.length === 0) return [];

  // Step 2: Apply quick filters via SQL
  const threadIds = ftsResults.map((r) => r.threadId);
  const filteredThreads = searchThreadsWithFilters(
    accountId,
    threadIds,
    params.filters,
  );

  if (filteredThreads.length === 0) return [];

  // Build FTS score map (BM25 rank — lower is better, we negate for sorting)
  const ftsScoreMap = new Map(ftsResults.map((r) => [r.threadId, r.rank]));

  // Build contact importance scores (0-1 normalized from tier 1-5)
  const importanceMap = params.importanceMap;

  let results: SearchResult[] = filteredThreads.map((thread) => {
    const ftsScore = ftsScoreMap.get(thread.id) ?? 0;
    const senderEmail = thread.participants[0]?.email?.toLowerCase() ?? '';
    const tier = importanceMap?.get(senderEmail) ?? 1;
    const contactImportance = tier; // raw tier 1-5

    return {
      thread,
      ftsScore,
      contactImportance,
      finalScore: -ftsScore, // Negate BM25 (lower rank = more relevant → higher finalScore)
    };
  });

  // Step 3: AI reranking
  if (results.length > 1) {
    const aiScores = await rerankCandidates(
      params.query,
      results,
      importanceMap,
    );

    results = results.map((r) => {
      const aiScore = aiScores.get(r.thread.id) ?? 5;
      const normalizedFTS = normalizeFTSScore(r.ftsScore, ftsResults);
      const normalizedAI = aiScore / 10;
      const normalizedImportance = (r.contactImportance ?? 1) / 5; // tier 1-5 → 0.2-1.0

      return {
        ...r,
        aiScore,
        finalScore:
          0.3 * normalizedFTS + 0.5 * normalizedAI + 0.2 * normalizedImportance,
      };
    });
  }

  // Sort by final score (descending) and limit
  return results
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, FINAL_RESULT_LIMIT);
}

/**
 * Normalize BM25 rank to 0-1 range (higher = more relevant).
 * BM25 ranks are negative (more negative = more relevant).
 */
function normalizeFTSScore(
  score: number,
  allResults: { rank: number }[],
): number {
  if (allResults.length <= 1) return 1;

  const ranks = allResults.map((r) => r.rank);
  const min = Math.min(...ranks); // Most relevant (most negative)
  const max = Math.max(...ranks); // Least relevant

  if (min === max) return 1;

  // Invert: min rank (most relevant) → 1, max rank → 0
  return (max - score) / (max - min);
}
