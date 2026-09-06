// A single low-value shared secret over TLS, at low request volume —
// plain equality is proportionate here; a timing-safe comparison would be
// over-engineering for this threat model (and isn't a clean Web Crypto API
// primitive in Workers anyway).
export function isAuthorized(request, env) {
  const provided = request.headers.get('X-Admin-Password');
  return !!env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' }
  });
}
