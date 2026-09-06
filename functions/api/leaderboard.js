import { json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT player_name AS name, claimed_sprint AS sprint, claimed_budget AS budget, finished_at, ending_reason AS reason
     FROM runs
     WHERE approved = 1 AND suspicious = 0 AND player_name IS NOT NULL
     ORDER BY claimed_sprint DESC, claimed_budget DESC
     LIMIT 10`
  ).all();

  return json({ entries: results });
}
