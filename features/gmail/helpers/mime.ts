/**
 * MIME parsing and email composition utilities.
 */

import type { EmailAttachment, ComposeEmailData } from '@/types';
import type { GmailMessagePayload } from '../types';
import { base64Decode, base64Encode, base64UrlEncode } from './encoding';

/**
 * Get a header value from Gmail message headers
 */
export function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value;
}

/**
 * Extract text and HTML body from message payload
 */
export function extractBody(payload: GmailMessagePayload): {
  text: string;
  html: string;
} {
  let text = '';
  let html = '';

  const extractPart = (part: GmailMessagePayload) => {
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = base64Decode(part.body.data);
    }
    if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = base64Decode(part.body.data);
    }
    if (text && html) return;
    if (part.parts) {
      part.parts.forEach(extractPart);
    }
  };

  if (payload.body?.data) {
    if (payload.mimeType === 'text/plain' && !text) {
      text = base64Decode(payload.body.data);
    } else if (payload.mimeType === 'text/html' && !html) {
      html = base64Decode(payload.body.data);
    }
  }

  if (payload.parts) {
    payload.parts.forEach(extractPart);
  }

  return { text, html };
}

/**
 * Extract attachments from message payload
 */
export function extractAttachments(
  messageId: string,
  payload: GmailMessagePayload,
): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];

  const extractPart = (part: GmailMessagePayload) => {
    if (part.filename && part.body.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        message_id: messageId,
        filename: part.filename,
        mime_type: part.mimeType,
        size: part.body.size,
        content_id: part.headers?.find((h) => h.name === 'Content-ID')?.value,
        is_inline:
          part.headers?.some(
            (h) =>
              h.name === 'Content-Disposition' && h.value.includes('inline'),
          ) || false,
      });
    }
    if (part.parts) {
      part.parts.forEach(extractPart);
    }
  };

  if (payload.parts) {
    payload.parts.forEach(extractPart);
  }

  return attachments;
}

/**
 * Create a raw MIME email message for sending
 */
export function createRawEmail(data: ComposeEmailData): string {
  const boundary = `----=_Part_${Date.now()}`;

  let email = '';
  email += `To: ${data.to.map((p) => (p.name ? `"${p.name}" <${p.email}>` : p.email)).join(', ')}\r\n`;
  if (data.from) {
    email += `From: ${data.from.name ? `"${data.from.name}" <${data.from.email}>` : data.from.email}\r\n`;
  }
  if (data.cc?.length) {
    email += `Cc: ${data.cc.map((p) => (p.name ? `"${p.name}" <${p.email}>` : p.email)).join(', ')}\r\n`;
  }
  if (data.bcc?.length) {
    email += `Bcc: ${data.bcc.map((p) => (p.name ? `"${p.name}" <${p.email}>` : p.email)).join(', ')}\r\n`;
  }
  email += `Subject: ${data.subject}\r\n`;
  if (data.inReplyTo) {
    email += `In-Reply-To: ${data.inReplyTo}\r\n`;
    email += `References: ${data.inReplyTo}\r\n`;
  }
  email += `MIME-Version: 1.0\r\n`;

  if (data.attachments?.length) {
    email += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    email += `--${boundary}\r\n`;
  }

  email += `Content-Type: text/html; charset=UTF-8\r\n`;
  email += `Content-Transfer-Encoding: base64\r\n\r\n`;
  const htmlBody = data.bodyHtml || data.body.replace(/\n/g, '<br>');
  email += base64Encode(htmlBody);

  if (data.attachments?.length) {
    email += `\r\n--${boundary}--`;
  }

  return base64UrlEncode(email);
}
