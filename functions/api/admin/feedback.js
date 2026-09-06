import { json } from '../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../_shared/adminAuth.js';

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  // ip_hash/user_agent are triage-only fields (see http.js's hashIp
  // comment) — never returned to any client, admin included, same as
  // runs.js's admin listing.
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, message
     FROM feedback
     ORDER BY id DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return json({ feedback: results });
}
