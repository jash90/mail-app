import {
  fixTextEncoding,
  base64Decode,
  base64Encode,
  base64UrlEncode,
  decodeHtmlEntities,
} from '@/src/features/gmail/helpers/encoding';

describe('fixTextEncoding', () => {
  it('returns clean ASCII strings unchanged', () => {
    expect(fixTextEncoding('Hello World')).toBe('Hello World');
  });

  it('returns proper Unicode unchanged', () => {
    expect(fixTextEncoding('Zażółć gęślą jaźń')).toBe('Zażółć gęślą jaźń');
  });

  it('fixes single-level Latin-1 mojibake of UTF-8', () => {
    // "ł" in UTF-8 is 0xC5 0x82 → interpreted as Latin-1 gives "Å‚"
    const mojibaked = String.fromCharCode(0xc5, 0x82);
    expect(fixTextEncoding(mojibaked)).toBe('ł');
  });
});

describe('base64Decode', () => {
  it('decodes standard base64', () => {
    const encoded = Buffer.from('Hello World').toString('base64');
    expect(base64Decode(encoded)).toBe('Hello World');
  });

  it('decodes URL-safe base64 (with - and _)', () => {
    // URL-safe: replace + with -, / with _
    const standard = Buffer.from('Hello+World/Test').toString('base64');
    const urlSafe = standard
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(base64Decode(urlSafe)).toBe('Hello+World/Test');
  });

  it('returns empty string for empty input', () => {
    expect(base64Decode('')).toBe('');
  });

  it('decodes UTF-8 content', () => {
    const encoded = Buffer.from('Zażółć gęślą jaźń').toString('base64');
    expect(base64Decode(encoded)).toBe('Zażółć gęślą jaźń');
  });
});

describe('base64Encode', () => {
  it('encodes to standard base64', () => {
    expect(base64Encode('Hello')).toBe(Buffer.from('Hello').toString('base64'));
  });
});

describe('base64UrlEncode', () => {
  it('produces URL-safe base64 without padding', () => {
    const result = base64UrlEncode('Hello World');
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes &amp; &lt; &gt; &quot;', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  it('decodes &#39; (apostrophe)', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
  });

  it('decodes hex entities like &#x105;', () => {
    expect(decodeHtmlEntities('&#x105;')).toBe('ą');
  });

  it('decodes decimal entities like &#322;', () => {
    expect(decodeHtmlEntities('&#322;')).toBe('ł');
  });

  it('leaves plain text unchanged', () => {
    expect(decodeHtmlEntities('no entities here')).toBe('no entities here');
  });
});
