// Server-side sanitizer for free-text player feedback. Unlike nameFilter.js
// (a short, single-line, publicly-displayed name), feedback is private
// (admin-only), multi-line, and longer — so this keeps newlines instead of
// collapsing all whitespace, and doesn't police profanity/URLs (there's no
// public display to protect here, and legitimate feedback is allowed to be
// blunt). The actual "no injections" guarantees live elsewhere: SQL
// injection is closed by parameterized queries at the call site, and XSS is
// closed on the *render* side (admin.js uses textContent, never innerHTML) —
// this module's job is just trimming garbage and bounding length.

const MAX_LENGTH = 500; // generous for a real bug report/suggestion, bounded
// enough to keep this from being a free-form paste dump.

export function filterFeedback(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };

  const cleaned = raw
    .replace(/\r\n/g, '\n')
    // Strip C0 control chars EXCEPT tab (\x09) and newline (\x0A) — this is
    // multi-line free text, not a single-line display name.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7f]/g, '')
    .trim();

  if (cleaned.length === 0) return { ok: false, reason: 'empty' };
  if (cleaned.length > MAX_LENGTH) return { ok: false, reason: 'too_long' };

  return { ok: true, cleaned };
}

export { MAX_LENGTH };
