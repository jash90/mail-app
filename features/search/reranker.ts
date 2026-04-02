import { getProvider } from '@/features/ai/providers';
import type { SearchResult } from './types';

const MAX_CANDIDATES = 15;

const SYSTEM_PROMPT = `You are a search relevance scorer. Given a search query and a list of emails, rate each email's relevance to the query on a scale of 0-10.

Rules:
- 10 = perfect match (exact topic, sender, or content)
- 7-9 = highly relevant (related topic or sender)
- 4-6 = somewhat relevant (tangential connection)
- 1-3 = low relevance
- 0 = completely irrelevant

Return ONLY a valid JSON array of numbers in the same order as the emails. Example: [9, 3, 7, 1, 5]
No explanation, no extra text — just the JSON array.`;

/**
 * AI reranking — uses current AI provider (llama.rn or Z.AI) to score
 * candidate search results by semantic relevance to the query.
 */
export async function rerankCandidates(
  query: string,
  candidates: SearchResult[],
): Promise<Map<string, number>> {
  const scoreMap = new Map<string, number>();
  const toRank = candidates.slice(0, MAX_CANDIDATES);

  if (toRank.length === 0) return scoreMap;

  const emailList = toRank
    .map((c, i) => {
      const from = c.thread.participants[0];
      const sender = from
        ? `${from.name ?? ''} <${from.email}>`.trim()
        : 'Unknown';
      return `${i + 1}. Subject: "${c.thread.subject}" | From: ${sender} | Preview: "${c.thread.snippet.slice(0, 120)}" | Labels: ${c.thread.label_ids.join(', ')}`;
    })
    .join('\n');

  const userPrompt = `Search query: "${query}"\n\nEmails:\n${emailList}`;

  try {
    const provider = getProvider();
    const response = await provider.generate([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    const scores = parseScores(response, toRank.length);

    for (let i = 0; i < toRank.length; i++) {
      scoreMap.set(toRank[i].thread.id, scores[i] ?? 5);
    }
  } catch (error) {
    console.warn(
      '[reranker] AI reranking failed, using FTS scores only:',
      error,
    );
    // Fallback: give all candidates a neutral score
    for (const c of toRank) {
      scoreMap.set(c.thread.id, 5);
    }
  }

  return scoreMap;
}

/** Parse AI response into array of scores, with fallback to 5 for missing/invalid. */
function parseScores(response: string, expectedLength: number): number[] {
  try {
    // Extract JSON array from response (handles markdown code blocks too)
    const match = response.match(/\[[\d\s,.]+\]/);
    if (!match) return Array(expectedLength).fill(5);

    const parsed = JSON.parse(match[0]) as unknown[];
    return Array.from({ length: expectedLength }, (_, i) => {
      const val = Number(parsed[i]);
      return Number.isFinite(val) ? Math.max(0, Math.min(10, val)) : 5;
    });
  } catch {
    return Array(expectedLength).fill(5);
  }
}
