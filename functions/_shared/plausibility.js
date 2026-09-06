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
  const n = Math.max(0, Math.floor(claimedSprint));
  let totalMs = 0;
  for (let i = 0; i < n; i++) totalMs += minSpawnMs(i);
  return (totalMs / 1000) / MAX_GAME_SPEED;
}

// Combines the elapsed-time floor with a checkpoint-trail requirement —
// together, the concrete answer to "make it hard to just inspect the page
// and POST a forged score": a single forged request has no prior
// checkpoints, and even a scripted attacker replaying real checkpoints
// still can't beat the physical spawn-timing floor above.
export function checkPlausibility({ claimedSprint, elapsedSeconds, checkpointCount }) {
  const reasons = [];
  if (elapsedSeconds < sprintFloorSeconds(claimedSprint) * FLOOR_SLACK) reasons.push('time_floor_violated');
  if (checkpointCount === 0 && claimedSprint > 3) reasons.push('no_checkpoints');
  return { suspicious: reasons.length > 0, reasons };
}
