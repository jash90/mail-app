import { parseCompositeId } from '@/lib/parseCompositeId';

describe('parseCompositeId', () => {
  it('splits accountId_providerId correctly', () => {
    expect(parseCompositeId('abc123_thread456')).toEqual({
      accountId: 'abc123',
      providerId: 'thread456',
    });
  });

  it('handles provider ID with underscores', () => {
    expect(parseCompositeId('acc_id_with_underscores')).toEqual({
      accountId: 'acc',
      providerId: 'id_with_underscores',
    });
  });

  it('returns empty strings for undefined input', () => {
    expect(parseCompositeId(undefined)).toEqual({
      accountId: '',
      providerId: '',
    });
  });

  it('returns empty strings for empty string', () => {
    expect(parseCompositeId('')).toEqual({
      accountId: '',
      providerId: '',
    });
  });

  it('returns empty strings for string without separator', () => {
    expect(parseCompositeId('noseparator')).toEqual({
      accountId: '',
      providerId: '',
    });
  });

  it('returns empty strings when separator is first character', () => {
    expect(parseCompositeId('_onlyprovider')).toEqual({
      accountId: '',
      providerId: '',
    });
  });
});
