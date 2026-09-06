import { json, hashIp, randomSecret } from '../../_shared/http.js';
import { isRateLimited } from '../../_shared/rateLimit.js';

// Generous enough that a real player restarting/retrying repeatedly never
// hits it, tight enough to bound a scripted loop from bloating the runs
// table / burning through D1's write quota.
const START_RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxRequests: 20 };

export async function onRequestPost({ request, env }) {
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'));
  if (await isRateLimited(env.DB, ipHash, START_RATE_LIMIT)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const secret = randomSecret();
  const now = Date.now();
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 200);

  await env.DB.prepare(
    'INSERT INTO runs (session_secret, created_at, ip_hash, user_agent) VALUES (?, ?, ?, ?)'
  ).bind(secret, now, ipHash, userAgent).run();

  return json({ secret });
}
