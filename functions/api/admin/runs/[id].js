import { json, badRequest } from '../../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../../_shared/adminAuth.js';
import { filterName } from '../../../_shared/nameFilter.js';

export async function onRequestPatch({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return badRequest('invalid id');

  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }

  const sets = [];
  const values = [];
  if (typeof body.approved === 'boolean') { sets.push('approved = ?'); values.push(body.approved ? 1 : 0); }
  // Same filter the public /api/runs/name path enforces — the admin panel
  // is trusted, but there's no reason a curation edit should be able to
  // (re-)introduce something the automated filter would otherwise catch.
  if (typeof body.player_name === 'string') {
    const filtered = filterName(body.player_name);
    if (!filtered.ok) return badRequest('invalid player_name: ' + filtered.reason);
    sets.push('player_name = ?'); values.push(filtered.cleaned);
  }
  if (sets.length === 0) return badRequest('nothing to update');

  values.push(id);
  const result = await env.DB.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  if (result.meta.changes === 0) return badRequest('run not found');
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return badRequest('invalid id');

  const result = await env.DB.prepare('DELETE FROM runs WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return badRequest('run not found');
  return json({ ok: true });
}
