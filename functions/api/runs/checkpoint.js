import { json, badRequest } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }
  const { secret, claimedSprint, budget, stats } = body || {};
  if (typeof secret !== 'string' || !secret) return badRequest('missing secret');
  if (typeof claimedSprint !== 'number') return badRequest('missing claimedSprint');

  const now = Date.now();
  const result = await env.DB.prepare(
    `UPDATE runs SET
      last_checkpoint_at = ?,
      checkpoint_count = checkpoint_count + 1,
      claimed_sprint = ?,
      claimed_budget = ?,
      claimed_income = ?,
      claimed_salaries = ?,
      claimed_lost = ?,
      claimed_kills = ?
    WHERE session_secret = ? AND finished_at IS NULL`
  ).bind(
    now, claimedSprint, budget ?? null,
    stats?.income ?? null, stats?.salaries ?? null, stats?.lost ?? null, stats?.kills ?? null,
    secret
  ).run();

  // Silently no-op for an unknown/already-finished session — a checkpoint
  // failing is never fatal to gameplay (see js/leaderboard.js's try/catch),
  // so there's no reason to surface this as a hard error to the client.
  return json({ ok: result.meta.changes > 0 });
}
