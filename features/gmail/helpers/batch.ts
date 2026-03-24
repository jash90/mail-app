export interface BatchPartResult {
  status: number;
  body: unknown | null;
  contentId: string | null;
}

/**
 * Parse a multipart/mixed batch response with HTTP status and Content-ID for each part.
 */
export const parseMultipartResponseWithStatus = (
  responseText: string,
  boundary: string,
): BatchPartResult[] => {
  const parts = responseText.split(`--${boundary}`);
  const results: BatchPartResult[] = [];

  for (const part of parts) {
    if (part.trim() === '' || part.trim() === '--') continue;

    // Extract Content-ID from the outer MIME headers (before the blank line separating headers from body)
    const contentIdMatch = part.match(
      /Content-ID:\s*<?\s*response-(.*?)\s*>?/i,
    );
    const contentId = contentIdMatch ? contentIdMatch[1].trim() : null;

    // Extract HTTP status from the inner HTTP response line
    const statusMatch = part.match(/HTTP\/1\.1\s+(\d{3})/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    // Extract JSON body — use lazy match to avoid greedy capture across nested braces
    const jsonMatch = part.match(/\{[\s\S]*\}/);
    let body: unknown | null = null;
    if (jsonMatch) {
      try {
        body = JSON.parse(jsonMatch[0]);
      } catch {
        // Skip malformed JSON
      }
    }

    results.push({ status, body, contentId });
  }

  return results;
};
