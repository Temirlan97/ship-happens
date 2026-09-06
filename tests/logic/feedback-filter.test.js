import { describe, it, expect } from 'vitest';
import { filterFeedback, MAX_LENGTH } from '../../functions/_shared/feedbackFilter.js';

describe('filterFeedback', () => {
  it('accepts a normal message, trimmed', () => {
    expect(filterFeedback('  Great game!  ')).toEqual({ ok: true, cleaned: 'Great game!' });
  });

  it('rejects an empty or whitespace-only message', () => {
    expect(filterFeedback('').ok).toBe(false);
    expect(filterFeedback('   ').ok).toBe(false);
    expect(filterFeedback('').reason).toBe('empty');
  });

  it('rejects a non-string input', () => {
    expect(filterFeedback(null).ok).toBe(false);
    expect(filterFeedback(42).ok).toBe(false);
    expect(filterFeedback(undefined).ok).toBe(false);
    expect(filterFeedback(null).reason).toBe('invalid');
  });

  it('rejects a message over the length cap', () => {
    const result = filterFeedback('a'.repeat(MAX_LENGTH + 1));
    expect(result).toEqual({ ok: false, reason: 'too_long' });
  });

  it('accepts a message right at the length cap', () => {
    expect(filterFeedback('a'.repeat(MAX_LENGTH)).ok).toBe(true);
  });

  it('strips control characters', () => {
    expect(filterFeedback('Hello\x00World')).toEqual({ ok: true, cleaned: 'HelloWorld' });
  });

  it('preserves newlines and tabs, unlike a single-line name filter', () => {
    expect(filterFeedback('Line one\nLine two\tindented')).toEqual({
      ok: true, cleaned: 'Line one\nLine two\tindented'
    });
  });

  it('normalizes CRLF line endings to a plain newline', () => {
    expect(filterFeedback('Line one\r\nLine two')).toEqual({
      ok: true, cleaned: 'Line one\nLine two'
    });
  });

  it('does not collapse internal whitespace runs (unlike filterName)', () => {
    expect(filterFeedback('Two   spaces')).toEqual({ ok: true, cleaned: 'Two   spaces' });
  });
});
