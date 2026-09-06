import { describe, it, expect } from 'vitest';
import { filterName } from '../../functions/_shared/nameFilter.js';

describe('filterName', () => {
  it('accepts a normal name, trimmed', () => {
    expect(filterName('  Alice  ')).toEqual({ ok: true, cleaned: 'Alice' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(filterName('').ok).toBe(false);
    expect(filterName('   ').ok).toBe(false);
  });

  it('rejects a non-string input', () => {
    expect(filterName(null).ok).toBe(false);
    expect(filterName(42).ok).toBe(false);
    expect(filterName(undefined).ok).toBe(false);
  });

  it('rejects a name over the length cap', () => {
    const result = filterName('a'.repeat(21));
    expect(result).toEqual({ ok: false, reason: 'too_long' });
  });

  it('accepts a name right at the length cap', () => {
    expect(filterName('a'.repeat(20)).ok).toBe(true);
  });

  it('rejects known profanity, case-insensitively and as a substring', () => {
    expect(filterName('fuck').reason).toBe('profanity');
    expect(filterName('FUCKface').reason).toBe('profanity');
    expect(filterName('xXbitchXx').reason).toBe('profanity');
  });

  it('rejects URL-like names', () => {
    expect(filterName('http://evil.com').reason).toBe('url_or_handle');
    expect(filterName('visit www.spam.xyz').reason).toBe('url_or_handle');
    expect(filterName('mysite.com').reason).toBe('url_or_handle');
    expect(filterName('follow @someone').reason).toBe('url_or_handle');
  });

  it('strips control characters', () => {
    expect(filterName('Al\x00ice')).toEqual({ ok: true, cleaned: 'Alice' });
  });

  it('collapses internal whitespace runs', () => {
    expect(filterName('Al   ice')).toEqual({ ok: true, cleaned: 'Al ice' });
  });
});
