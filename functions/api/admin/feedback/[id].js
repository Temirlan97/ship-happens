import { badRequest, json } from '../../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../../_shared/adminAuth.js';

export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return badRequest('invalid id');

  const result = await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) return badRequest('feedback not found');
  return json({ ok: true });
}
