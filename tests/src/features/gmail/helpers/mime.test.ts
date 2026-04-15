import {
  getHeader,
  extractBody,
  createRawEmail,
} from '@/src/features/gmail/helpers/mime';
import type { GmailMessagePayload } from '@/src/features/gmail/types';

describe('getHeader', () => {
  const headers = [
    { name: 'Subject', value: 'Test Subject' },
    { name: 'From', value: 'sender@test.com' },
    { name: 'Content-Type', value: 'text/plain' },
  ];

  it('finds header by name (case-insensitive)', () => {
    expect(getHeader(headers, 'subject')).toBe('Test Subject');
    expect(getHeader(headers, 'SUBJECT')).toBe('Test Subject');
    expect(getHeader(headers, 'Subject')).toBe('Test Subject');
  });

  it('returns undefined for missing header', () => {
    expect(getHeader(headers, 'X-Missing')).toBeUndefined();
  });

  it('returns undefined for empty headers array', () => {
    expect(getHeader([], 'Subject')).toBeUndefined();
  });
});

describe('extractBody', () => {
  it('extracts text from simple text/plain payload', () => {
    const encoded = Buffer.from('Hello World')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const payload: GmailMessagePayload = {
      partId: '',
      mimeType: 'text/plain',
      filename: '',
      headers: [],
      body: { data: encoded, size: 11 },
    };

    const { text, html } = extractBody(payload);
    expect(text).toBe('Hello World');
    expect(html).toBe('');
  });

  it('extracts both text and html from multipart payload', () => {
    const textEncoded = Buffer.from('Plain text')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const htmlEncoded = Buffer.from('<b>HTML</b>')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const payload: GmailMessagePayload = {
      partId: '',
      mimeType: 'multipart/alternative',
      filename: '',
      headers: [],
      body: { size: 0 },
      parts: [
        {
          partId: '0',
          mimeType: 'text/plain',
          filename: '',
          headers: [],
          body: { data: textEncoded, size: 10 },
        },
        {
          partId: '1',
          mimeType: 'text/html',
          filename: '',
          headers: [],
          body: { data: htmlEncoded, size: 11 },
        },
      ],
    };

    const { text, html } = extractBody(payload);
    expect(text).toBe('Plain text');
    expect(html).toBe('<b>HTML</b>');
  });

  it('returns empty strings for payload with no body data', () => {
    const payload: GmailMessagePayload = {
      partId: '',
      mimeType: 'multipart/mixed',
      filename: '',
      headers: [],
      body: { size: 0 },
    };

    const { text, html } = extractBody(payload);
    expect(text).toBe('');
    expect(html).toBe('');
  });
});

describe('createRawEmail', () => {
  it('creates a valid MIME email', () => {
    const raw = createRawEmail({
      to: [{ name: 'Bob', email: 'bob@test.com' }],
      subject: 'Test',
      body: 'Hello Bob',
    });

    // Result should be base64url encoded
    expect(raw).not.toContain('+');
    expect(raw).not.toContain('/');
    expect(raw).not.toContain('=');

    // Decode and check MIME structure
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    expect(decoded).toContain('To: "Bob" <bob@test.com>');
    expect(decoded).toContain('Subject: Test');
    expect(decoded).toContain('MIME-Version: 1.0');
    expect(decoded).toContain('Content-Type: text/html; charset=UTF-8');
  });

  it('includes CC and BCC when provided', () => {
    const raw = createRawEmail({
      to: [{ name: null, email: 'to@test.com' }],
      cc: [{ name: 'CC', email: 'cc@test.com' }],
      bcc: [{ name: null, email: 'bcc@test.com' }],
      subject: 'Test',
      body: 'Body',
    });

    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    expect(decoded).toContain('Cc: "CC" <cc@test.com>');
    expect(decoded).toContain('Bcc: bcc@test.com');
  });

  it('includes In-Reply-To headers for replies', () => {
    const raw = createRawEmail({
      to: [{ name: null, email: 'to@test.com' }],
      subject: 'Re: Test',
      body: 'Reply body',
      inReplyTo: '<original-msg-id@test.com>',
    });

    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <original-msg-id@test.com>');
    expect(decoded).toContain('References: <original-msg-id@test.com>');
  });
});
