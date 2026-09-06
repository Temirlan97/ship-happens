// A crude but effective per-IP rate limiter for runs/start.js — the one
// endpoint that creates new rows, so it's the actual lever for "loop this
// forever and bloat the D1 table / burn through the write quota." No
// KV/Durable Objects binding exists in this project, so this just counts
// recent rows from the same ip_hash via the runs table itself (see
// migrations/0003_add_ip_hash_index.sql for the index this query relies
// on) rather than standing up new infrastructure for a hobby project.
//
// Not race-free under a true concurrent burst (two requests could both
// pass the count check before either INSERTs) — acceptable for this threat
// model, where the goal is bounding a sustained scripted loop, not
// defending against a sub-millisecond race.
export async function isRateLimited(db, ipHash, { windowMs, maxRequests }) {
  if (!ipHash) return false; // no IP to key on — fail open, same as hashIp's own null-IP behavior
  const since = Date.now() - windowMs;
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM runs WHERE ip_hash = ? AND created_at > ?'
  ).bind(ipHash, since).first();
  return (row?.n ?? 0) >= maxRequests;
}
