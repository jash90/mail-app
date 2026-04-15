import { formatContext, type EmailContext } from '@/src/features/ai/types';

describe('formatContext', () => {
  it('formats both sender and recipient', () => {
    const ctx: EmailContext = {
      from: { email: 'john@example.com', name: 'John Doe' },
      user: { givenName: 'Jane', familyName: 'Smith' },
    };

    const result = formatContext(ctx);

    expect(result).toContain('Odbiorca: John Doe <john@example.com>');
    expect(result).toContain('Nadawca: Jane Smith');
  });

  it('handles missing from', () => {
    const ctx: EmailContext = {
      from: null,
      user: { givenName: 'Jane', familyName: 'Smith' },
    };

    const result = formatContext(ctx);

    expect(result).not.toContain('Odbiorca');
    expect(result).toContain('Nadawca: Jane Smith');
  });

  it('handles missing user', () => {
    const ctx: EmailContext = {
      from: { email: 'john@example.com', name: 'John' },
      user: null,
    };

    const result = formatContext(ctx);

    expect(result).toContain('Odbiorca: John <john@example.com>');
    expect(result).not.toContain('Nadawca');
  });

  it('returns empty string when both are null', () => {
    const result = formatContext({ from: null, user: null });
    expect(result).toBe('');
  });

  it('uses custom labels', () => {
    const ctx: EmailContext = {
      from: { email: 'a@b.com', name: 'A' },
      user: { givenName: 'B' },
    };

    const result = formatContext(ctx, {
      recipient: 'To',
      sender: 'From',
    });

    expect(result).toContain('To: A <a@b.com>');
    expect(result).toContain('From: B');
  });

  it('handles from with email but no name', () => {
    const ctx: EmailContext = {
      from: { email: 'test@test.com', name: '' },
      user: null,
    };

    const result = formatContext(ctx);
    expect(result).toContain('Odbiorca:  <test@test.com>');
  });
});
