import {
  stripQuotes,
  STRIPPED_QUOTE_MARKER,
} from '@/src/features/ai/anonymization/stripQuotes';

describe('stripQuotes', () => {
  it('returns empty input untouched', () => {
    expect(stripQuotes('')).toBe('');
  });

  it('leaves bodies without any quote markers untouched', () => {
    const body = 'Cześć, jak się masz? Pozdrawiam, Jan';
    expect(stripQuotes(body)).toBe(body);
  });

  it('strips a trailing English "On ... wrote:" block', () => {
    const body = [
      'Thanks for the update — will review tomorrow.',
      '',
      'On Mon, Jan 1, 2024 at 10:00 AM John Doe <john@example.com> wrote:',
      '> Hello, here is the report.',
      '> Phone: +48 600 700 800',
    ].join('\n');

    const result = stripQuotes(body);
    expect(result).toContain('Thanks for the update');
    expect(result).toContain(STRIPPED_QUOTE_MARKER);
    expect(result).not.toContain('+48 600 700 800');
    expect(result).not.toContain('john@example.com');
  });

  it('strips a trailing Polish "W dniu ... pisze:" block', () => {
    const body = [
      'Dziękuję za wiadomość, odpowiem wieczorem.',
      '',
      'W dniu poniedziałek, 1 stycznia 2024, Jan Kowalski <jan@acme.pl> pisze:',
      '> Treść oryginalnej wiadomości',
    ].join('\n');

    const result = stripQuotes(body);
    expect(result).toContain('Dziękuję za wiadomość');
    expect(result).toContain(STRIPPED_QUOTE_MARKER);
    expect(result).not.toContain('jan@acme.pl');
  });

  it('strips Outlook "-----Original Message-----" block (English)', () => {
    const body = [
      'Let me check and get back to you.',
      '',
      '-----Original Message-----',
      'From: jane@example.com',
      'Subject: Report',
    ].join('\n');

    expect(stripQuotes(body)).toContain('Let me check');
    expect(stripQuotes(body)).not.toContain('jane@example.com');
    expect(stripQuotes(body)).toContain(STRIPPED_QUOTE_MARKER);
  });

  it('strips Outlook "Wiadomość oryginalna" block (Polish)', () => {
    const body = [
      'Sprawdzę i odpowiem.',
      '',
      '-----Wiadomość oryginalna-----',
      'Od: jan@example.pl',
    ].join('\n');

    expect(stripQuotes(body)).toContain('Sprawdzę');
    expect(stripQuotes(body)).not.toContain('jan@example.pl');
  });

  it('strips HTML <blockquote> subtrees', () => {
    const body =
      '<p>Thanks!</p><blockquote>Original: alice@acme.com, PESEL 44051401458</blockquote>';
    const result = stripQuotes(body);
    expect(result).toContain('Thanks');
    expect(result).not.toContain('alice@acme.com');
    expect(result).not.toContain('44051401458');
  });

  it('strips nested HTML <blockquote> subtrees', () => {
    const body =
      '<p>Reply</p><blockquote>Outer<blockquote>Inner secret@x.com</blockquote>more outer</blockquote>';
    const result = stripQuotes(body);
    expect(result).toContain('Reply');
    expect(result).not.toContain('secret@x.com');
    expect(result).not.toContain('Outer');
    expect(result).not.toContain('Inner');
  });

  it('strips plaintext ">" quote blocks preceded by a newline', () => {
    const body = [
      'Yes, that works for me.',
      '',
      '> Can we meet Tuesday?',
      '> Best, Alice alice@acme.com',
    ].join('\n');

    const result = stripQuotes(body);
    expect(result).toContain('Yes, that works');
    expect(result).not.toContain('alice@acme.com');
    expect(result).toContain(STRIPPED_QUOTE_MARKER);
  });

  it('cuts at the EARLIEST marker when multiple are present', () => {
    const body = [
      'Short answer: yes.',
      '',
      'On Mon, Jan 1 John wrote:',
      '> Inside the quote',
      '-----Original Message-----',
      'From: x@y.com',
    ].join('\n');

    const result = stripQuotes(body);
    expect(result).toContain('Short answer');
    expect(result).not.toContain('Inside the quote');
    expect(result).not.toContain('x@y.com');
  });

  it('returns just the marker when the whole body is a quote block', () => {
    const body = [
      'On Mon, Jan 1 John wrote:',
      '> everything here is quoted',
    ].join('\n');

    expect(stripQuotes(body)).toBe(STRIPPED_QUOTE_MARKER);
  });

  it('does not cut bodies whose first character is ">" (no preceding newline)', () => {
    // A message that legitimately starts with ">" (unusual but possible) is
    // preserved — our regex requires a newline before the marker.
    const body = '> not actually a quote, just a weird opener';
    expect(stripQuotes(body)).toBe(body);
  });
});
