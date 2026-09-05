import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, WaveManager;

beforeEach(() => {
  Game = loadGame(['config.js', 'assets.js', 'audio.js', 'waves.js']);
  CFG = Game.Config;
  WaveManager = Game.Waves.WaveManager;
});

describe('WaveManager initial state', () => {
  it('starts before any sprint, already counting down to the first one', () => {
    const w = new WaveManager();
    expect(w.waveIndex).toBe(-1);
    expect(w.active).toBe(false);
    expect(w.displayWaveNumber).toBe(0);
    // Regression guard: the first sprint used to require a manual "Start
    // Sprint" click (betweenTimer sat at 0 until waveIndex >= 0). It now
    // auto-starts on the same countdown as every later sprint.
    expect(w.betweenTimer).toBe(w.betweenDuration);
  });
});

describe('WaveManager.tier / stageIndex / stage', () => {
  it('tier is 0 for every campaign sprint', () => {
    const w = new WaveManager();
    w.waveIndex = CFG.CAMPAIGN_SPRINTS - 1;
    expect(w.tier).toBe(0);
  });

  it('tier grows by 1 per sprint once past the campaign', () => {
    const w = new WaveManager();
    w.waveIndex = CFG.CAMPAIGN_SPRINTS + 2;
    expect(w.tier).toBe(3);
  });

  it('stageIndex tracks the highest funding stage whose triggerSprint has been reached', () => {
    const w = new WaveManager();
    w.waveIndex = CFG.FUNDING_STAGES[1].triggerSprint - 1; // displayWaveNumber === triggerSprint
    expect(w.stage.key).toBe(CFG.FUNDING_STAGES[1].key);
  });

  it('stageIndex stays at 0 (pre-seed) before the first real transition', () => {
    const w = new WaveManager();
    w.waveIndex = 0; // displayWaveNumber = 1
    expect(w.stage.key).toBe(CFG.FUNDING_STAGES[0].key);
  });
});

describe('WaveManager.buildWave', () => {
  it('uses the template counts as-is during the campaign (tier 0)', () => {
    const w = new WaveManager();
    const wave = w.buildWave(0);
    const template = CFG.SPRINTS[0];
    expect(wave.map(g => g.count)).toEqual(template.map(g => g.count));
  });

  it('scales counts up by ENDLESS_COUNT_GROWTH per tier once past the campaign', () => {
    const w = new WaveManager();
    const idx = CFG.CAMPAIGN_SPRINTS + 2; // tier 3
    const wave = w.buildWave(idx);
    const template = CFG.SPRINTS[idx % CFG.SPRINTS.length];
    const mult = 1 + 3 * CFG.ENDLESS_COUNT_GROWTH;
    wave.forEach((g, i) => expect(g.count).toBe(Math.round(template[i].count * mult)));
  });
});

describe('WaveManager.startNextWave', () => {
  it('is a no-op while a wave is already active', () => {
    const w = new WaveManager();
    w.active = true;
    w.startNextWave();
    expect(w.waveIndex).toBe(-1);
  });

  it('runs the payroll callback strictly BEFORE incrementing waveIndex', () => {
    const w = new WaveManager();
    let seenWaveIndexDuringCallback = null;
    w.startNextWave(() => { seenWaveIndexDuringCallback = w.waveIndex; });
    expect(seenWaveIndexDuringCallback).toBe(-1); // still the pre-increment value
    expect(w.waveIndex).toBe(0); // incremented after the callback ran
  });

  it('marks the wave active and resets betweenTimer to 0', () => {
    const w = new WaveManager();
    w.startNextWave();
    expect(w.active).toBe(true);
    expect(w.betweenTimer).toBe(0);
  });

  it('builds a spawn queue with cumulative timing across groups, honoring each group interval/gap', () => {
    const w = new WaveManager();
    w.startNextWave();
    const template = CFG.SPRINTS[0];
    const expectedCount = template.reduce((s, g) => s + g.count, 0);
    expect(w.queue).toHaveLength(expectedCount);
    // First group's spawns are `interval` ms apart starting at t=0.
    expect(w.queue[0].t).toBe(0);
    if (template[0].count > 1) expect(w.queue[1].t).toBe(template[0].interval);
  });

  it('flags justEnteredStage only on the sprint that actually crosses a funding-stage threshold', () => {
    const w = new WaveManager();
    // Advance to just before the 'seed' stage's trigger sprint.
    w.waveIndex = CFG.FUNDING_STAGES[1].triggerSprint - 2;
    w.startNextWave(); // this call's resulting displayWaveNumber === triggerSprint
    expect(w.justEnteredStage).toBe(1);
  });

  it('leaves justEnteredStage at -1 on a sprint that does not cross a stage boundary', () => {
    const w = new WaveManager();
    w.startNextWave(); // sprint 1, still pre-seed
    expect(w.justEnteredStage).toBe(-1);
  });
});

describe('WaveManager.skipCountdown', () => {
  it('immediately starts the next wave when between sprints', () => {
    const w = new WaveManager();
    w.skipCountdown();
    expect(w.active).toBe(true);
    expect(w.waveIndex).toBe(0);
  });

  it('does nothing while a wave is already active', () => {
    const w = new WaveManager();
    w.startNextWave();
    const waveIndexBefore = w.waveIndex;
    w.skipCountdown();
    expect(w.waveIndex).toBe(waveIndexBefore);
  });
});

describe('WaveManager.update', () => {
  it('auto-starts the very first sprint once its countdown elapses, with no prior manual start', () => {
    const w = new WaveManager();
    let paydayCalls = 0;
    w.update(w.betweenDuration + 0.001, () => {}, 0, () => { paydayCalls++; });
    expect(w.active).toBe(true);
    expect(w.waveIndex).toBe(0);
    expect(paydayCalls).toBe(1);
  });

  it('does not start early while time remains on the countdown', () => {
    const w = new WaveManager();
    w.update(w.betweenDuration - 1, () => {}, 0, () => {});
    expect(w.active).toBe(false);
    expect(w.waveIndex).toBe(-1);
  });

  it('spawns queued enemies once their scheduled time is reached', () => {
    const w = new WaveManager();
    w.startNextWave();
    const spawned = [];
    w.update(0, (type, tier) => spawned.push({ type, tier }), 999, () => {});
    expect(spawned).toHaveLength(1);
    expect(spawned[0].type).toBe(CFG.SPRINTS[0][0].type);
  });

  it('ends the wave and starts the between-sprint countdown once the queue is empty and no enemies remain alive', () => {
    const w = new WaveManager();
    w.startNextWave();
    w.timer = 999999; // fast-forward past every queued spawn time
    w.update(0, () => {}, 0, () => {}); // enemiesAliveCount = 0
    expect(w.active).toBe(false);
    expect(w.betweenTimer).toBe(w.betweenDuration);
  });

  it('will not end the wave while enemies from it are still alive, even with an empty queue', () => {
    const w = new WaveManager();
    w.startNextWave();
    w.timer = 999999;
    w.update(0, () => {}, 3, () => {}); // 3 enemies still alive
    expect(w.active).toBe(true);
  });
});
