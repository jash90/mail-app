import { PlaceholderMap } from './placeholders';

/**
 * Restore real values in an AI response by reversing the placeholder map.
 *
 * Used after the cloud call returns — the model sees `<NAME_1>` and
 * `<EMAIL_1>` in its output, and the user expects to see real names.
 *
 * Idempotent on text with no known placeholders.
 */
export function deAnonymize(text: string, map: PlaceholderMap): string {
  return map.applyReverse(text);
}
