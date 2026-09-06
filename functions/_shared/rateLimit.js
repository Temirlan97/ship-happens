// A crude but effective per-IP rate limiter, used against both runs.start
// (the endpoint that creates new leaderboard rows — the lever for "loop
// this forever and bloat the D1 table / burn through the write quota") and
// feedback (the lever for "spam the feedback inbox"). No KV/Durable
// Objects binding exists in this project, so this just counts recent rows
// from the same ip_hash via whichever table is asking (see
// migrations/0003_add_ip_hash_index.sql / 0004_add_feedback_table.sql for
// the indexes these queries rely on) rather than standing up new
// infrastructure for a hobby project.
//
// Not race-free under a true concurrent burst (two requests could both
// pass the count check before either INSERTs) — acceptable for this threat
// model, where the goal is bounding a sustained scripted loop, not
// defending against a sub-millisecond race.

// `table` is never attacker-controlled (always a hardcoded literal at the
// call site, interpolated because SQL can't parameterize an identifier) —
// allow-listed anyway per this codebase's whitelist-don't-trust-verbatim
// convention (see finish.js's endingReason for the same pattern).
const ALLOWED_TABLES = new Set(['runs', 'feedback']);

export async function isRateLimited(db, ipHash, { windowMs, maxRequests, table = 'runs' }) {
  if (!ipHash) return false; // no IP to key on — fail open, same as hashIp's own null-IP behavior
  if (!ALLOWED_TABLES.has(table)) throw new Error(`isRateLimited: unknown table "${table}"`);
  const since = Date.now() - windowMs;
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ip_hash = ? AND created_at > ?`
  ).bind(ipHash, since).first();
  return (row?.n ?? 0) >= maxRequests;
}
