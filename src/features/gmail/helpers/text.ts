import { fixTextEncoding, decodeHtmlEntities } from './encoding';
import { getHeader } from './mime';

export const cleanHeaderText = (
  headers: Array<{ name: string; value: string }>,
  name: string,
  fallback = '',
): string => fixTextEncoding(getHeader(headers, name) || fallback);

export const cleanSnippet = (snippet: string): string =>
  decodeHtmlEntities(snippet);
