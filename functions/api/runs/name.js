import { json, badRequest } from '../../_shared/http.js';
import { filterName } from '../../_shared/nameFilter.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }
  const { secret, name } = body || {};
  if (typeof secret !== 'string' || !secret) return badRequest('missing secret');

  const row = await env.DB.prepare(
    'SELECT finished_at, suspicious FROM runs WHERE session_secret = ?'
  ).bind(secret).first();
  if (!row) return badRequest('unknown run');
  if (!row.finished_at) return badRequest('run is not finished yet');
  if (row.suspicious) return json({ ok: false, reason: 'not_eligible' });

  const filtered = filterName(name);
  if (!filtered.ok) return json({ ok: false, reason: filtered.reason });

  await env.DB.prepare(
    'UPDATE runs SET player_name = ?, name_set_at = ? WHERE session_secret = ?'
  ).bind(filtered.cleaned, Date.now(), secret).run();

  return json({ ok: true, name: filtered.cleaned });
}
