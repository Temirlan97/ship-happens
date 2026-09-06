// Hand-duplicated from js/config.js (SPRINTS, CAMPAIGN_SPRINTS,
// ENDLESS_COUNT_GROWTH) and js/waves.js's WaveManager.buildWave/
// startNextWave spawn-scheduling math. Pages Functions run in a separate
// Workers runtime from the client's <script>-loaded, window-global IIFE
// files, so this can't just `import` js/config.js directly.
//
// tests/logic/leaderboard-plausibility.test.js has a drift-guard test that
// loads the REAL js/config.js (via tests/helpers/loadGame.js) and asserts
// these three constants deep-equal the copies below — so if a future
// balance-tuning pass changes SPRINTS/CAMPAIGN_SPRINTS/ENDLESS_COUNT_GROWTH
// and forgets to update this file, CI fails instead of the plausibility
// floor silently drifting out of sync with the real game.

// Also hand-duplicated from js/config.js's Config.START_BUDGET — see
// budgetCeiling below. Covered by the same drift-guard test as the other
// constants in this block.
export const START_BUDGET = 22000;

export const CAMPAIGN_SPRINTS = 10;
export const ENDLESS_COUNT_GROWTH = 0.12;
export const SPRINTS = [
  [{ type: 'bug', count: 6, interval: 900, gap: 0 }],
  [{ type: 'bug', count: 9, interval: 750, gap: 0 }],
  [{ type: 'bug', count: 6, interval: 800, gap: 600 }, { type: 'competitor', count: 4, interval: 400, gap: 0 }],
  [{ type: 'competitor', count: 9, interval: 450, gap: 0 }],
  [{ type: 'bug', count: 8, interval: 700, gap: 800 }, { type: 'incident', count: 2, interval: 1200, gap: 0 }],
  [{ type: 'competitor', count: 6, interval: 450, gap: 600 }, { type: 'incident', count: 3, interval: 1200, gap: 0 }],
  [{ type: 'bug', count: 10, interval: 600, gap: 700 }, { type: 'competitor', count: 6, interval: 400, gap: 0 }],
  [{ type: 'incident', count: 6, interval: 1000, gap: 700 }, { type: 'competitor', count: 6, interval: 400, gap: 0 }],
  [{ type: 'bug', count: 10, interval: 550, gap: 600 }, { type: 'competitor', count: 8, interval: 380, gap: 600 }, { type: 'incident', count: 4, interval: 1100, gap: 0 }],
  [{ type: 'incident', count: 9, interval: 900, gap: 700 }, { type: 'competitor', count: 10, interval: 350, gap: 700 }, { type: 'bug', count: 10, interval: 400, gap: 0 }]
];

// The fastest a player can legitimately advance game-time relative to real
// wall-clock time — see js/game.js Core.cycleSpeed() (1x/2x/3x/4x).
export const MAX_GAME_SPEED = 4;

// A generous slack multiplier on the computed floor, to absorb network
// latency and clock skew between the client's run-start and the server's
// received finish time — NOT to compensate for any uncertainty in the floor
// itself (that's already a strict lower bound, see minSpawnMs below).
export const FLOOR_SLACK = 0.85;

// Hard ceiling on claimedSprint before it drives sprintFloorSeconds' loop —
// without this, a client could submit an astronomically large claimedSprint
// (e.g. 1e9) and force a single request to do unbounded work. minSpawnMs's
// own per-wave cost grows with ENDLESS_COUNT_GROWTH (roughly quadratic
// overall, not linear), so this can't just be "some big round number" — it
// has to stay cheap even at the cap. 5000 measured at ~11ms for the full
// loop, comfortably inside a Worker's CPU budget, while still describing a
// multi-hour Scale-Up marathon (each sprint takes at least a few real
// seconds even at 4x speed) that no real run is likely to ever reach.
// Capping lower only ever makes the floor MORE lenient for anything beyond
// it (see sprintFloorSeconds' own doc comment), never less — so this is
// safe to keep well below "generous" if the cost curve ever demands it.
export const MAX_PLAUSIBLE_SPRINT = 5000;

// The exact per-wave spawn-scheduling loop from WaveManager.startNextWave,
// returning the elapsed game-ms at which the LAST enemy of that wave spawns
// (not when it's defeated/leaked — deliberately ignored, see module doc).
export function minSpawnMs(waveIndex) {
  const tier = Math.max(0, waveIndex - (CAMPAIGN_SPRINTS - 1));
  const template = SPRINTS[waveIndex % SPRINTS.length];
  const countMult = 1 + tier * ENDLESS_COUNT_GROWTH;
  let t = 0;
  let lastSpawnT = 0;
  for (const g of template) {
    const count = tier === 0 ? g.count : Math.round(g.count * countMult);
    for (let i = 0; i < count; i++) {
      lastSpawnT = t;
      t += g.interval;
    }
    t += g.gap || 0;
  }
  return lastSpawnT;
}

// The minimum real-world seconds a legitimate client could possibly have
// taken to reach `claimedSprint` (1-based, matches WaveManager.displayWaveNumber)
// — deliberately a strict lower bound (ignores enemy travel/kill time and
// assumes the between-sprint countdown was skipped instantly via "Skip
// Wait"), so it can only under-estimate the true minimum, never flag a
// legitimately fast/skilled run as impossible.
export function sprintFloorSeconds(claimedSprint) {
  const n = Math.min(MAX_PLAUSIBLE_SPRINT, Math.max(0, Math.floor(claimedSprint) || 0));
  let totalMs = 0;
  for (let i = 0; i < n; i++) totalMs += minSpawnMs(i);
  return (totalMs / 1000) / MAX_GAME_SPEED;
}

// A deliberately generous upper bound on how much Budget a real client could
// plausibly have accumulated in `elapsedSeconds` of real (server-observed)
// time — NOT an exact economy simulation (team composition/upgrades/luck
// vary too much to bound tightly), just picked well above even a maxed-out
// theoretical income rate. PM income scales with tower level (see
// js/entities.js Tower.update: `amount = income * mult.dmg`,
// `interval = def.interval * mult.rate`), and nothing caps how many of the
// 12 desks can be PMs — at MAX_TOWER_LEVEL (mult.dmg=2.9, mult.rate=0.68)
// and 4x speed, a single maxed PM alone is `1200*2.9 * (4*1000)/(4000*0.68)`
// ≈ $5,118/real-second, so 12 maxed PMs (theoretically, ignoring that
// filling every desk with PMs would leave nothing to fight incoming
// enemies) tops out around $61,400/real-second. This is set to roughly
// double that, so it stays well clear of even that unrealistic all-PM
// theoretical max — plus headroom for funding-stage injections/bounties on
// top — while still closing the actual gap this exists for: a forged
// request pairing a tiny claimed sprint (and thus a tiny required elapsed
// time) with an arbitrarily large claimed budget. elapsedSeconds here is
// derived server-side from runs.created_at, so the client can't shrink it
// to buy a bigger budget ceiling — claiming a huge budget still requires
// claiming (and the server independently measuring) real elapsed time to
// match.
export const BUDGET_CEILING_PER_SECOND = 125000;

export function budgetCeiling(elapsedSeconds) {
  return START_BUDGET + BUDGET_CEILING_PER_SECOND * Math.max(0, elapsedSeconds);
}

// Combines the elapsed-time floor, a checkpoint-trail requirement, and a
// budget ceiling — together, the concrete answer to "make it hard to just
// inspect the page and POST a forged score": a single forged request has no
// prior checkpoints, even a scripted attacker replaying real checkpoints
// still can't beat the physical spawn-timing floor above, and claiming an
// implausibly large budget for how little time has actually elapsed gets
// caught even if the sprint/checkpoint claims are individually consistent.
export function checkPlausibility({ claimedSprint, elapsedSeconds, checkpointCount, budget }) {
  const reasons = [];
  if (elapsedSeconds < sprintFloorSeconds(claimedSprint) * FLOOR_SLACK) reasons.push('time_floor_violated');
  if (checkpointCount === 0 && claimedSprint > 3) reasons.push('no_checkpoints');
  if (typeof budget === 'number' && Number.isFinite(budget) && budget > budgetCeiling(elapsedSeconds)) {
    reasons.push('budget_ceiling_violated');
  }
  return { suspicious: reasons.length > 0, reasons };
}
