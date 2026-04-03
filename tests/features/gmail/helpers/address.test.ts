import {
  parseEmailAddress,
  parseEmailAddressList,
} from '@/features/gmail/helpers/address';

describe('parseEmailAddress', () => {
  it('parses "Name <email>" format', () => {
    expect(parseEmailAddress('John Doe <john@example.com>')).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('parses quoted name format', () => {
    expect(parseEmailAddress('"Jane Smith" <jane@example.com>')).toEqual({
      name: 'Jane Smith',
      email: 'jane@example.com',
    });
  });

  it('parses bare email address', () => {
    expect(parseEmailAddress('user@example.com')).toEqual({
      name: null,
      email: 'user@example.com',
    });
  });

  it('parses email in angle brackets without name', () => {
    expect(parseEmailAddress('<user@example.com>')).toEqual({
      name: null,
      email: 'user@example.com',
    });
  });

  it('handles empty name with angle brackets', () => {
    const result = parseEmailAddress(' <user@example.com>');
    expect(result.email).toBe('user@example.com');
  });
});

describe('parseEmailAddressList', () => {
  it('parses comma-separated list', () => {
    const result = parseEmailAddressList(
      'Alice <alice@test.com>, bob@test.com',
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[0].email).toBe('alice@test.com');
    expect(result[1].email).toBe('bob@test.com');
  });

  it('returns empty array for empty string', () => {
    expect(parseEmailAddressList('')).toEqual([]);
  });

  it('handles single address', () => {
    const result = parseEmailAddressList('single@test.com');
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('single@test.com');
  });
});
