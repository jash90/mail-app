import { getProvider } from '@/features/ai/providers';
import type { SearchResult } from './types';

const MAX_CANDIDATES = 15;

const SYSTEM_PROMPT = `You are a search relevance scorer. Given a search query and a list of emails with contact importance tiers, rate each email's relevance on a scale of 0-10.

Contact importance tiers (1-5):
- Tier 5: VIP contact (top 10% by exchange frequency, mutual communication)
- Tier 4: Important contact (top 25%)
- Tier 3: Regular contact
- Tier 2: Occasional contact
- Tier 1: Rare/unknown sender (newsletters, notifications, no-reply)

Scoring rules:
- 10 = perfect match (exact topic + important sender)
- 7-9 = highly relevant (strong topic match OR important sender with related topic)
- 4-6 = somewhat relevant (tangential connection, boost if high-tier sender)
- 1-3 = low relevance (weak match, even from known senders)
- 0 = completely irrelevant

When two emails match the query equally, prefer the one from the higher-tier contact.

Return ONLY a valid JSON array of numbers in the same order as the emails. Example: [9, 3, 7, 1, 5]
No explanation, no extra text — just the JSON array.`;

/**
 * AI reranking — uses current AI provider (llama.rn or Z.AI) to score
 * candidate search results by semantic relevance to the query.
 */
export async function rerankCandidates(
  query: string,
  candidates: SearchResult[],
  importanceMap?: Map<string, number>,
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
      const senderEmail = from?.email?.toLowerCase() ?? '';
      const tier = importanceMap?.get(senderEmail) ?? 1;
      const preview = c.thread.snippet.slice(0, 120);
      const labels = c.thread.label_ids.join(', ');
      return (
        `${i + 1}. Subject: "${c.thread.subject}" | From: ${sender}` +
        ` | Importance: tier ${tier}/5 | Preview: "${preview}"` +
        ` | Labels: ${labels}`
      );
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
