import { json } from '../../_shared/http.js';
import { isAuthorized, unauthorizedResponse } from '../../_shared/adminAuth.js';

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorizedResponse();

  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) AS totalRuns,
       SUM(CASE WHEN finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finishedRuns,
       SUM(CASE WHEN suspicious = 1 THEN 1 ELSE 0 END) AS suspiciousRuns,
       COALESCE(SUM(duration_seconds), 0) AS totalPlaySeconds,
       COALESCE(AVG(duration_seconds), 0) AS avgPlaySeconds,
       COALESCE(AVG(claimed_sprint), 0) AS avgSprintReached,
       COALESCE(MAX(claimed_sprint), 0) AS bestSprintEver
     FROM runs`
  ).first();

  const { results: bySprint } = await env.DB.prepare(
    `SELECT claimed_sprint AS sprint, COUNT(*) AS n
     FROM runs
     WHERE finished_at IS NOT NULL
     GROUP BY claimed_sprint
     ORDER BY claimed_sprint ASC`
  ).all();

  const { results: last14Days } = await env.DB.prepare(
    `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n
     FROM runs
     WHERE created_at > ?
     GROUP BY day
     ORDER BY day ASC`
  ).bind(Date.now() - 14 * 24 * 60 * 60 * 1000).all();

  return json({ totals, bySprint, last14Days });
}
