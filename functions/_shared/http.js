export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export function badRequest(message) {
  return json({ error: message }, 400);
}

// Genuinely secret-critical hashing has no place here — this is only ever
// used for abuse-triage grouping on an internal admin field
// (runs.ip_hash), never returned to any client, never a real security
// boundary. A fixed in-code salt is fine for that; it doesn't need to be a
// rotatable Cloudflare secret.
const IP_HASH_SALT = 'ship-happens-ip-triage-v1';

export async function hashIp(ip) {
  if (!ip) return null;
  const data = new TextEncoder().encode(ip + ':' + IP_HASH_SALT);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSecret() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}
