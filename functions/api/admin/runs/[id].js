import { json, badRequest } from '../../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../../_shared/adminAuth.js';

export async function onRequestPatch({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return badRequest('invalid id');

  let body;
  try { body = await request.json(); } catch { return badRequest('invalid json'); }

  const sets = [];
  const values = [];
  if (typeof body.approved === 'boolean') { sets.push('approved = ?'); values.push(body.approved ? 1 : 0); }
  if (typeof body.player_name === 'string') { sets.push('player_name = ?'); values.push(body.player_name.slice(0, 20)); }
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
