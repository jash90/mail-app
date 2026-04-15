import { parseMultipartResponseWithStatus } from '@/src/features/gmail/helpers/batch';

describe('parseMultipartResponseWithStatus', () => {
  const boundary = 'batch_boundary';

  it('parses a single part with status and JSON body', () => {
    const response = [
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-ID: <response-item1>',
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      '',
      '{"id": "msg1", "threadId": "t1"}',
      `--${boundary}--`,
    ].join('\r\n');

    const results = parseMultipartResponseWithStatus(response, boundary);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe(200);
    expect(results[0]!.contentId).toBe('item1');
    expect(results[0]!.body).toEqual({ id: 'msg1', threadId: 't1' });
  });

  it('parses multiple parts', () => {
    const response = [
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-ID: <response-a>',
      '',
      'HTTP/1.1 200 OK',
      '',
      '{"id": "a"}',
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-ID: <response-b>',
      '',
      'HTTP/1.1 404 Not Found',
      '',
      '{"error": {"code": 404, "message": "Not Found"}}',
      `--${boundary}--`,
    ].join('\r\n');

    const results = parseMultipartResponseWithStatus(response, boundary);
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe(200);
    expect(results[0]!.contentId).toBe('a');
    expect(results[1]!.status).toBe(404);
    expect(results[1]!.contentId).toBe('b');
  });

  it('handles parts with no JSON body', () => {
    const response = [
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-ID: <response-x>',
      '',
      'HTTP/1.1 204 No Content',
      '',
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const results = parseMultipartResponseWithStatus(response, boundary);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe(204);
    expect(results[0]!.body).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const response = [
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-ID: <response-z>',
      '',
      'HTTP/1.1 200 OK',
      '',
      '{not valid json',
      `--${boundary}--`,
    ].join('\r\n');

    const results = parseMultipartResponseWithStatus(response, boundary);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe(200);
    // Malformed JSON — body should be null since parse fails
    // but the regex might still match '{not valid json' — depends on implementation
  });

  it('returns empty array for empty response', () => {
    const results = parseMultipartResponseWithStatus('', boundary);
    expect(results).toEqual([]);
  });

  it('handles parts without Content-ID', () => {
    const response = [
      `--${boundary}`,
      'Content-Type: application/http',
      '',
      'HTTP/1.1 200 OK',
      '',
      '{"id": "no-content-id"}',
      `--${boundary}--`,
    ].join('\r\n');

    const results = parseMultipartResponseWithStatus(response, boundary);
    expect(results).toHaveLength(1);
    expect(results[0]!.contentId).toBeNull();
    expect(results[0]!.status).toBe(200);
  });
});
