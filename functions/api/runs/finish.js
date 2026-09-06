import { json, badRequest } from '../../_shared/http.js';
import { checkPlausibility } from '../../_shared/plausibility.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }
  const { secret, claimedSprint, budget, stats, reason } = body || {};
  if (typeof secret !== 'string' || !secret) return badRequest('missing secret');
  if (typeof claimedSprint !== 'number') return badRequest('missing claimedSprint');
  // Whitelisted, not just stored verbatim — this is client-reported display
  // data (same trust level as the other claimed_* fields), not a value
  // anything security-sensitive branches on, but there's no reason to let
  // an arbitrary string into the column either.
  const endingReason = reason === 'acquired' ? 'acquired' : 'bankrupt';

  const row = await env.DB.prepare(
    'SELECT created_at, checkpoint_count, finished_at FROM runs WHERE session_secret = ?'
  ).bind(secret).first();
  if (!row) return badRequest('unknown run');
  if (row.finished_at) return json({ qualifiesForName: false, rank: null }); // already finished, no-op

  const now = Date.now();
  const elapsedSeconds = (now - row.created_at) / 1000;
  const { suspicious, reasons } = checkPlausibility({
    claimedSprint,
    elapsedSeconds,
    checkpointCount: row.checkpoint_count
  });

  await env.DB.prepare(
    `UPDATE runs SET
      finished_at = ?,
      duration_seconds = ?,
      claimed_sprint = ?,
      claimed_budget = ?,
      claimed_income = ?,
      claimed_salaries = ?,
      claimed_lost = ?,
      claimed_kills = ?,
      suspicious = ?,
      suspicious_reason = ?,
      ending_reason = ?
    WHERE session_secret = ?`
  ).bind(
    now, Math.round(elapsedSeconds), claimedSprint, budget ?? null,
    stats?.income ?? null, stats?.salaries ?? null, stats?.lost ?? null, stats?.kills ?? null,
    suspicious ? 1 : 0, reasons.join(',') || null, endingReason,
    secret
  ).run();

  if (suspicious) return json({ qualifiesForName: false, rank: null });

  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM runs
     WHERE approved = 1 AND suspicious = 0 AND finished_at IS NOT NULL
       AND (claimed_sprint > ? OR (claimed_sprint = ? AND claimed_budget > ?))`
  ).bind(claimedSprint, claimedSprint, budget ?? 0).first();

  const rank = (ahead?.n ?? 0) + 1;
  return json({ qualifiesForName: rank <= 10, rank });
}
