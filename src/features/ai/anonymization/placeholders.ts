import type { EntityType } from './types';

export interface PlaceholderMapSnapshot {
  [placeholder: string]: string;
}

/**
 * Bidirectional placeholder map for one anonymization request.
 *
 * Guarantees:
 *   - Same (type, value) pair → same placeholder token across calls on the
 *     same map instance. This lets `<NAME_1>` mean the same person in the
 *     system context and in the email body within a single request.
 *   - Placeholder numbering is per-type, starting at 1 (`<EMAIL_1>`,
 *     `<EMAIL_2>`, ...), so tokens read naturally.
 *   - `applyForward` replaces originals with placeholders, longest-value
 *     first, so a longer value (`jane@acme.com`) is replaced before a
 *     shorter value it contains (`jane`).
 *   - `applyReverse` restores placeholders to originals, longest-placeholder
 *     first, so `<EMAIL_10>` isn't truncated to `<EMAIL_1>0`.
 */
export class PlaceholderMap {
  /** `${type}::${value}` → placeholder token. */
  private readonly forward = new Map<string, string>();

  /** Placeholder token → original value. */
  private readonly reverse = new Map<string, string>();

  /** Per-type next-index counter. */
  private readonly counters = new Map<EntityType, number>();

  /**
   * Allocate (or reuse) a placeholder for the given (type, value) pair.
   * Idempotent: the same (type, value) always returns the same placeholder.
   */
  allocate(type: EntityType, value: string): string {
    const key = `${type}::${value}`;
    const existing = this.forward.get(key);
    if (existing) return existing;

    const nextIndex = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, nextIndex);

    const placeholder = `<${type}_${nextIndex}>`;
    this.forward.set(key, placeholder);
    this.reverse.set(placeholder, value);
    return placeholder;
  }

  /**
   * Look up the original value for a placeholder token. Returns `null` if
   * the token was never allocated through this map.
   */
  resolve(placeholder: string): string | null {
    return this.reverse.get(placeholder) ?? null;
  }

  /**
   * Replace every known original value in `text` with its placeholder.
   * Longest values first to avoid overlap corruption.
   */
  applyForward(text: string): string {
    const entries = [...this.forward.entries()]
      .map(([key, placeholder]) => ({
        value: valueFromKey(key),
        placeholder,
      }))
      .sort((a, b) => b.value.length - a.value.length);

    let result = text;
    for (const { value, placeholder } of entries) {
      if (!value) continue;
      result = literalReplaceAll(result, value, placeholder);
    }
    return result;
  }

  /**
   * Replace every known placeholder in `text` with its original value.
   * Longest placeholders first so `<EMAIL_10>` binds before `<EMAIL_1>`.
   */
  applyReverse(text: string): string {
    const placeholders = [...this.reverse.keys()].sort(
      (a, b) => b.length - a.length,
    );

    let result = text;
    for (const placeholder of placeholders) {
      const value = this.reverse.get(placeholder);
      if (value === undefined) continue;
      result = literalReplaceAll(result, placeholder, value);
    }
    return result;
  }

  /** Dump all placeholder → value pairs (debugging and tests). */
  snapshot(): PlaceholderMapSnapshot {
    const out: PlaceholderMapSnapshot = {};
    for (const [placeholder, value] of this.reverse.entries()) {
      out[placeholder] = value;
    }
    return out;
  }

  /** Number of unique (type, value) pairs allocated so far. */
  get size(): number {
    return this.forward.size;
  }
}

function valueFromKey(key: string): string {
  const sepIndex = key.indexOf('::');
  return sepIndex === -1 ? key : key.slice(sepIndex + 2);
}

/**
 * Literal (non-regex) replace-all. Treats `search` as a plain substring so
 * regex metacharacters in PII values don't cause injection bugs.
 */
function literalReplaceAll(
  text: string,
  search: string,
  replacement: string,
): string {
  if (!search) return text;
  return text.split(search).join(replacement);
}
