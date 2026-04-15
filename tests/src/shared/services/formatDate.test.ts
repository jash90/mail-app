import {
  formatRelativeDateCoarse,
  formatRelativeDateFine,
  formatDuration,
} from '@/src/shared/services/formatDate';

describe('formatRelativeDateCoarse', () => {
  it('returns "Today" for dates from today', () => {
    const now = new Date().toISOString();
    expect(formatRelativeDateCoarse(now)).toBe('Today');
  });

  it('returns "Yesterday" for dates from yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(formatRelativeDateCoarse(yesterday)).toBe('Yesterday');
  });

  it('returns "Xd ago" for dates within a week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatRelativeDateCoarse(threeDaysAgo)).toBe('3d ago');
  });

  it('returns locale date string for dates older than a week', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const result = formatRelativeDateCoarse(twoWeeksAgo);
    // Should be a formatted date string, not a relative one
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Yesterday');
  });
});

describe('formatRelativeDateFine', () => {
  it('returns "Just now" for very recent dates', () => {
    const now = new Date().toISOString();
    expect(formatRelativeDateFine(now)).toBe('Just now');
  });

  it('returns "Xm ago" for minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeDateFine(fiveMinAgo)).toBe('5m ago');
  });

  it('returns "Xh ago" for hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeDateFine(threeHoursAgo)).toBe('3h ago');
  });

  it('returns "Xd ago" for days within a week', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(formatRelativeDateFine(twoDaysAgo)).toBe('2d ago');
  });

  it('returns locale date for dates older than a week', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const result = formatRelativeDateFine(twoWeeksAgo);
    expect(result).not.toContain('ago');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(45 * 60000)).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(5 * 3600000 + 30 * 60000)).toBe('5h 30m');
  });

  it('formats days and hours', () => {
    expect(formatDuration(2 * 86400000 + 3 * 3600000)).toBe('2d 3h');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});
