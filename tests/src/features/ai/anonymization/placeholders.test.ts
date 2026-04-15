import { PlaceholderMap } from '@/src/features/ai/anonymization/placeholders';

describe('PlaceholderMap', () => {
  it('allocates sequential placeholders per type', () => {
    const map = new PlaceholderMap();
    expect(map.allocate('EMAIL', 'a@example.com')).toBe('<EMAIL_1>');
    expect(map.allocate('EMAIL', 'b@example.com')).toBe('<EMAIL_2>');
    expect(map.allocate('PHONE', '600700800')).toBe('<PHONE_1>');
    expect(map.allocate('EMAIL', 'c@example.com')).toBe('<EMAIL_3>');
  });

  it('reuses the same placeholder for repeated values', () => {
    const map = new PlaceholderMap();
    const first = map.allocate('NAME', 'Jan Kowalski');
    const second = map.allocate('NAME', 'Jan Kowalski');
    expect(first).toBe(second);
    expect(map.size).toBe(1);
  });

  it('distinguishes same value with different types', () => {
    const map = new PlaceholderMap();
    expect(map.allocate('NAME', 'test')).toBe('<NAME_1>');
    expect(map.allocate('OTHER', 'test')).toBe('<OTHER_1>');
    expect(map.size).toBe(2);
  });

  it('resolves placeholders back to originals', () => {
    const map = new PlaceholderMap();
    map.allocate('EMAIL', 'a@example.com');
    expect(map.resolve('<EMAIL_1>')).toBe('a@example.com');
    expect(map.resolve('<EMAIL_99>')).toBeNull();
  });

  it('round-trips text via forward + reverse', () => {
    const map = new PlaceholderMap();
    map.allocate('EMAIL', 'alice@acme.com');
    map.allocate('NAME', 'Jan Kowalski');

    const original = 'Kontakt: alice@acme.com lub Jan Kowalski.';
    const anonymized = map.applyForward(original);
    expect(anonymized).toBe('Kontakt: <EMAIL_1> lub <NAME_1>.');
    expect(map.applyReverse(anonymized)).toBe(original);
  });

  it('replaces longer values before shorter overlapping ones', () => {
    const map = new PlaceholderMap();
    map.allocate('EMAIL', 'jane@acme.com');
    map.allocate('NAME', 'jane');

    const input = 'jane@acme.com and jane';
    const output = map.applyForward(input);
    expect(output).toBe('<EMAIL_1> and <NAME_1>');
  });

  it('reverses longer placeholders before shorter ones (EMAIL_10 vs EMAIL_1)', () => {
    const map = new PlaceholderMap();
    // Allocate 10 so EMAIL_10 exists; its original is user10@example.com
    // only if allocation #10 is that string, so we allocate in that order.
    for (let i = 1; i <= 10; i++) {
      map.allocate('EMAIL', `user${i}@example.com`);
    }
    expect(map.resolve('<EMAIL_1>')).toBe('user1@example.com');
    expect(map.resolve('<EMAIL_10>')).toBe('user10@example.com');

    const text = '<EMAIL_10> wrote to <EMAIL_1>';
    expect(map.applyReverse(text)).toBe(
      'user10@example.com wrote to user1@example.com',
    );
  });

  it('handles values containing regex metacharacters literally', () => {
    const map = new PlaceholderMap();
    map.allocate('OTHER', 'a.b+c$d');
    const out = map.applyForward('before a.b+c$d after');
    expect(out).toBe('before <OTHER_1> after');
  });

  it('snapshot returns all placeholder → value pairs', () => {
    const map = new PlaceholderMap();
    map.allocate('EMAIL', 'a@b.com');
    map.allocate('NAME', 'Kasia');
    expect(map.snapshot()).toEqual({
      '<EMAIL_1>': 'a@b.com',
      '<NAME_1>': 'Kasia',
    });
  });

  it('applyForward is a no-op on an empty map', () => {
    const map = new PlaceholderMap();
    expect(map.applyForward('hello world')).toBe('hello world');
  });
});
