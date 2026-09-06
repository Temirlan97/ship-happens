import { json, badRequest, hashIp } from '../_shared/http.js';
import { filterFeedback } from '../_shared/feedbackFilter.js';
import { isRateLimited } from '../_shared/rateLimit.js';

// Generous enough that a real player fixing a typo and resubmitting never
// hits it, tight enough to bound a scripted loop from spamming the inbox.
const FEEDBACK_RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxRequests: 5, table: 'feedback' };

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'));
  if (await isRateLimited(env.DB, ipHash, FEEDBACK_RATE_LIMIT)) {
    // Same {ok,reason} shape as the filterFeedback failures below, so the
    // client can show a specific message regardless of which check failed.
    return json({ ok: false, reason: 'rate_limited' }, 429);
  }

  const filtered = filterFeedback(body?.message);
  if (!filtered.ok) return json({ ok: false, reason: filtered.reason });

  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 200);
  await env.DB.prepare(
    'INSERT INTO feedback (created_at, message, ip_hash, user_agent) VALUES (?, ?, ?, ?)'
  ).bind(Date.now(), filtered.cleaned, ipHash, userAgent).run();

  return json({ ok: true });
}
