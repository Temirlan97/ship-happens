import { json } from '../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../_shared/adminAuth.js';

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
  const suspiciousOnly = url.searchParams.get('suspicious') === '1';
  const approvedOnly = url.searchParams.get('approved') === '1';

  const conditions = [];
  if (suspiciousOnly) conditions.push('suspicious = 1');
  if (approvedOnly) conditions.push('approved = 1');
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, finished_at, duration_seconds, checkpoint_count,
            claimed_sprint, claimed_budget, claimed_income, claimed_salaries,
            claimed_lost, claimed_kills, suspicious, suspicious_reason,
            player_name, approved, ending_reason
     FROM runs ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return json({ runs: results });
}
