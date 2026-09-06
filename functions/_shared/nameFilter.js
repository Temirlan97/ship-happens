// Server-side filter for leaderboard player names — a first line of
// defense, not a complete solution (no unicode-homoglyph/leetspeak
// evasion handling in v1). The admin page's curation tools are the real
// backstop for anything that slips through this.

const MAX_LENGTH = 20;

// Small, deliberately conservative wordlist — obvious profanity/slurs
// only, matched as a lowercase substring. Extend here if something slips
// through, rather than reaching for an external moderation API for a
// hobby project's leaderboard.
const BLOCKED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'nigga', 'faggot',
  'retard', 'whore', 'slut', 'rape', 'nazi', 'hitler'
];

// URL / advertising patterns — someone using the name field to plug a
// site/handle rather than as a name.
const URL_LIKE = /https?:\/\/|www\.|\.(com|net|org|io|xyz|gg|tv|co)\b|@\w{2,}|t\.me\//i;

export function filterName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid' };

  // Strip control characters and collapse whitespace before anything else.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').trim().replace(/\s+/g, ' ');

  if (cleaned.length === 0) return { ok: false, reason: 'empty' };
  if (cleaned.length > MAX_LENGTH) return { ok: false, reason: 'too_long' };

  const lower = cleaned.toLowerCase();
  if (BLOCKED_SUBSTRINGS.some((word) => lower.includes(word))) {
    return { ok: false, reason: 'profanity' };
  }
  if (URL_LIKE.test(cleaned)) {
    return { ok: false, reason: 'url_or_handle' };
  }

  return { ok: true, cleaned };
}
