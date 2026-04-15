/**
 * Strip quoted-reply chains from an email body before sending to cloud AI.
 *
 * In a long reply thread, most of the content (and therefore most of the
 * leakable PII) is old quoted messages from every participant. Stripping
 * them is the single biggest risk reduction in the pipeline.
 *
 * Handles:
 *   - HTML `<blockquote>` subtrees (iteratively, for nested quotes)
 *   - English "On ... wrote:" header (Gmail, Apple Mail)
 *   - Polish "W dniu ... pisze:" header (Gmail PL)
 *   - Outlook "-----Original Message-----" separator (EN + PL)
 *   - Plaintext `> ` inline quote lines
 *
 * Conservative: when in doubt, cut MORE. Over-stripping reduces AI summary
 * quality but never leaks data; under-stripping is a security hole.
 */

export const STRIPPED_QUOTE_MARKER = '[previous messages removed for privacy]';

/** Non-greedy so nested and multiple blockquotes are handled by the loop. */
const BLOCKQUOTE_RE = /<blockquote\b[\s\S]*?<\/blockquote>/gi;

/**
 * Quote markers. Each is tested against the full body; the earliest match
 * wins so we cut at the first boundary regardless of which format is used.
 *
 * The `m` flag makes `^` and `$` match line boundaries so `On ... wrote:` at
 * the start of any line is a valid match (not only at position 0).
 */
const QUOTE_MARKERS: RegExp[] = [
  // Gmail / Apple Mail English: "On Mon, Jan 1, 2024 at 10:00 AM John wrote:"
  /^On\b[^\n]*\bwrote:\s*$/m,
  // Gmail Polish: "W dniu poniedziałek, 1 stycznia 2024, Jan Kowalski pisze:"
  /^W dniu\b[^\n]*\bpisze:\s*$/m,
  // Outlook English
  /^-{2,}\s*Original Message\s*-{2,}\s*$/m,
  // Outlook Polish
  /^-{2,}\s*Wiadomość oryginalna\s*-{2,}\s*$/m,
  // Plaintext `> ` inline quote line (must be preceded by newline so we don't
  // match a user body that literally begins with `>`)
  /\n[ \t]*>[ \t]/,
];

function stripBlockquotes(html: string): string {
  let previous: string;
  let current = html;
  // Loop until the regex is stable — catches nested blockquotes.
  do {
    previous = current;
    current = current.replace(BLOCKQUOTE_RE, '');
  } while (current !== previous);
  return current;
}

function cutAtFirstQuoteMarker(body: string): string {
  let earliest = -1;
  for (const re of QUOTE_MARKERS) {
    const found = body.match(re);
    if (found && found.index !== undefined) {
      if (earliest === -1 || found.index < earliest) {
        earliest = found.index;
      }
    }
  }
  if (earliest === -1) return body;

  const head = body.slice(0, earliest).trimEnd();
  if (!head) return STRIPPED_QUOTE_MARKER;
  return `${head}\n\n${STRIPPED_QUOTE_MARKER}`;
}

/**
 * Remove quoted-reply history from an email body, preserving the user's
 * own reply text that comes before the quote block.
 */
export function stripQuotes(body: string): string {
  if (!body) return body;
  const withoutBlockquote = stripBlockquotes(body);
  return cutAtFirstQuoteMarker(withoutBlockquote);
}
