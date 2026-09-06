import { json, hashIp, randomSecret } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  const secret = randomSecret();
  const now = Date.now();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'));
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 200);

  await env.DB.prepare(
    'INSERT INTO runs (session_secret, created_at, ip_hash, user_agent) VALUES (?, ?, ?, ?)'
  ).bind(secret, now, ipHash, userAgent).run();

  return json({ secret });
}
