/**
 * Text encoding, base64, and HTML entity utilities.
 */

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Fix UTF-8 mojibake: reverses Latin-1 misinterpretation of UTF-8 bytes.
 * e.g. "BartÃ…Â‚omiej" → "Bartłomiej"
 * Applies recursively for multi-level encoding (max 3 passes).
 */
export function fixTextEncoding(str: string): string {
  let current = str;
  for (let i = 0; i < 3; i++) {
    if (!/[\u0080-\u00ff]/.test(current)) break;
    try {
      const bytes = new Uint8Array(current.length);
      for (let j = 0; j < current.length; j++) {
        const code = current.charCodeAt(j);
        if (code > 0xff) return current;
        bytes[j] = code;
      }
      const decoded = utf8Decoder.decode(bytes);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

/**
 * Decode URL-safe base64 to string
 */
export function base64Decode(data: string): string {
  if (!data) return '';

  const base64 =
    data.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (data.length % 4)) % 4);

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
  } catch (e) {
    console.warn('[base64Decode] Buffer path failed, falling back to atob', e);
  }
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch (error) {
    console.error('[base64Decode] decode failed', { error, dataLength: data.length });
    return '';
  }
}

/**
 * Encode string to base64
 */
export function base64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Encode string to URL-safe base64
 */
export function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const namedEntities: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

/**
 * Decode HTML entities in Gmail snippets (e.g. &#39; &#x105; &amp;)
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&#x([0-9a-fA-F]+);|&#(\d+);|&\w+;|&#39;/g,
    (match, hex, dec) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      return namedEntities[match] ?? match;
    },
  );
}
