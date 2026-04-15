import {
  cleanHeaderText,
  cleanSnippet,
} from '@/src/features/gmail/helpers/text';

describe('cleanHeaderText', () => {
  const headers = [
    { name: 'Subject', value: 'Hello World' },
    { name: 'From', value: 'test@example.com' },
  ];

  it('returns the header value by name', () => {
    expect(cleanHeaderText(headers, 'Subject')).toBe('Hello World');
  });

  it('returns fallback when header is missing', () => {
    expect(cleanHeaderText(headers, 'X-Custom', 'default')).toBe('default');
  });

  it('returns empty string as default fallback', () => {
    expect(cleanHeaderText(headers, 'X-Missing')).toBe('');
  });
});

describe('cleanSnippet', () => {
  it('decodes HTML entities in snippets', () => {
    expect(cleanSnippet('Hello &amp; World')).toBe('Hello & World');
  });

  it('decodes apostrophes', () => {
    expect(cleanSnippet('It&#39;s great')).toBe("It's great");
  });

  it('leaves plain text unchanged', () => {
    expect(cleanSnippet('No entities')).toBe('No entities');
  });
});
