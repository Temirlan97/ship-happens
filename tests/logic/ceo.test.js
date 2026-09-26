import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core, Entities;

beforeEach(() => {
  // ceoGender/ceoName persist via localStorage across loadGame() calls by
  // design (see js/game.js's loadCeoGender etc.) —
  // clear it so tests that don't care about identity aren't affected by
  // whatever a previous test in this file left behind.
  try { localStorage.clear(); } catch (e) { /* not available in every env */ }
  Game = loadGame();
  CFG = Game.Config;
  PATH = Game.Path;
  Core = Game.Core;
  Entities = Game.Entities;
  PATH.relayout(1600, 1000);
});

describe('Core.runwayRatio', () => {
  it('is 1 with no hired teammates (nothing to burn)', () => {
    expect(Core.runwayRatio).toBe(1);
  });

  it('is budget / (payroll * 3), clamped to [0,1]', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;
    Core.budget = payroll * 1.5;
    expect(Core.runwayRatio).toBeCloseTo(0.5, 6);
  });

  it('never exceeds 1 even with a huge budget', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = Core.projectedPayroll * 100;
    expect(Core.runwayRatio).toBe(1);
  });

  it('never goes below 0 with a negative budget', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = -999999;
    expect(Core.runwayRatio).toBe(0);
  });
});

// ceoStateIndex reflects the company's CURRENT budget, not how far into the
// game it is — a late-game company that's currently broke should look it,
// not ride on an earlier stage's appearance. Deliberately independent of
// core.waves.stage / core.acquisitionMilestoneIndex.
describe('Core.ceoStateIndex — driven by current budget, not game progress', () => {
  it('is Crisis (0) whenever budget is negative, regardless of how much progress has been made', () => {
    Core.budget = -1;
    Core.waves.waveIndex = 10; // deep into Scale-Up
    Core.acquisitionMilestoneIndex = 3;
    expect(Core.ceoStateIndex).toBe(0);
  });

  it('treats budget exactly at 0 as non-Crisis, and the smallest negative amount as Crisis', () => {
    Core.budget = 0;
    expect(Core.ceoStateIndex).not.toBe(0);
    Core.budget = -0.01;
    expect(Core.ceoStateIndex).toBe(0);
  });

  it('walks through all 6 tiers purely by budget amount', () => {
    const t = CFG.CEO.wealthThresholds;
    Core.budget = 0;
    expect(Core.ceoStateIndex).toBe(1); // Bootstrapping
    Core.budget = t[0];
    expect(Core.ceoStateIndex).toBe(2); // Growing
    Core.budget = t[1];
    expect(Core.ceoStateIndex).toBe(3); // Established
    Core.budget = t[2];
    expect(Core.ceoStateIndex).toBe(4); // Successful
    Core.budget = t[3];
    expect(Core.ceoStateIndex).toBe(5); // Tycoon
  });

  it('rounds UP to the next tier exactly AT each threshold, both directions, for all 4 boundaries', () => {
    // budget < threshold is the tier-N condition, so budget === threshold
    // must already read as tier N+1 — check the smallest possible amount
    // on each side of every one of the 4 thresholds, not just the >= side.
    const t = CFG.CEO.wealthThresholds;
    const tierAtThreshold = [2, 3, 4, 5]; // tier when budget === t[i]
    for (let i = 0; i < t.length; i++) {
      Core.budget = t[i] - 1;
      expect(Core.ceoStateIndex, `t[${i}]-1`).toBe(tierAtThreshold[i] - 1);
      Core.budget = t[i];
      expect(Core.ceoStateIndex, `t[${i}] exactly`).toBe(tierAtThreshold[i]);
      Core.budget = t[i] + 1;
      expect(Core.ceoStateIndex, `t[${i}]+1`).toBe(tierAtThreshold[i]);
    }
  });

  it('a late-game company that is currently poor looks Bootstrapping, not Established/Tycoon', () => {
    Core.waves.waveIndex = 10; // Scale-Up, would have implied "Established" under the old stage-based design
    Core.acquisitionMilestoneIndex = 2; // would have implied "Tycoon"
    Core.budget = 100; // but actually nearly broke right now
    expect(Core.ceoStateIndex).toBe(1);
  });

  it('an early-game company that is currently rich looks the part immediately', () => {
    Core.waves.waveIndex = -1; // Pre-Seed, would have implied "Bootstrapping" under the old design
    Core.acquisitionMilestoneIndex = 0;
    Core.budget = CFG.CEO.wealthThresholds[3]; // Tycoon-level cash, e.g. from a lucky early run
    expect(Core.ceoStateIndex).toBe(5);
  });
});

describe('Core.confirmIdentity', () => {
  it('sets gender/name, mirrors gender onto stats, and starts the game by default', () => {
    Core.confirmIdentity('Ada', 'female');
    expect(Core.ceoGender).toBe('female');
    expect(Core.ceoName).toBe('Ada');
    expect(Core.stats.ceoGender).toBe('female');
    expect(Core.state).toBe('playing');
  });

  it('dispatches to restart() instead of start() when pendingGameAction is "restart" (the Start Over flow)', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = 999;
    Core.pendingGameAction = 'restart';
    Core.confirmIdentity('Ada', 'female');
    expect(Core.state).toBe('playing');
    expect(Core.towers).toHaveLength(0); // restart() clears towers, start() would not
    expect(Core.budget).toBe(CFG.START_BUDGET);
  });

  it('falls back to the current gender for an invalid value instead of rejecting the whole call', () => {
    Core.ceoGender = 'male';
    Core.confirmIdentity('Grace', 'not-a-gender');
    expect(Core.ceoGender).toBe('male');
    expect(Core.ceoName).toBe('Grace');
  });

  it('trims whitespace and caps the name at 20 characters', () => {
    Core.confirmIdentity('   Alexandria The Great Founder   ', 'male');
    expect(Core.ceoName).toBe('Alexandria The Great'.slice(0, 20));
    expect(Core.ceoName.length).toBeLessThanOrEqual(20);
  });

  it('treats a non-string name as empty rather than throwing', () => {
    expect(() => Core.confirmIdentity(undefined, 'male')).not.toThrow();
    expect(Core.ceoName).toBe('');
  });

  it('persists gender/name across a fresh load, unlike run-scoped CEO state — used only to pre-fill the picker, not to skip it', () => {
    Core.confirmIdentity('Ada', 'female');
    const reloaded = loadGame();
    expect(reloaded.Core.ceoGender).toBe('female');
    expect(reloaded.Core.ceoName).toBe('Ada');
  });

  it('calling it again (a second game in the same session) re-persists the new values cleanly', () => {
    Core.confirmIdentity('Ada', 'female');
    Core.confirmIdentity('Grace', 'male');
    expect(Core.ceoGender).toBe('male');
    expect(Core.ceoName).toBe('Grace');
    const reloaded = loadGame();
    expect(reloaded.Core.ceoGender).toBe('male');
    expect(reloaded.Core.ceoName).toBe('Grace');
  });

  it('a whitespace-only name trims down to an empty string', () => {
    Core.confirmIdentity('    ', 'male');
    expect(Core.ceoName).toBe('');
  });

  it('rejects gender casing that does not exactly match "male"/"female", falling back instead of accepting it', () => {
    Core.ceoGender = 'female';
    Core.confirmIdentity('Ada', 'Male');
    expect(Core.ceoGender).toBe('female'); // fell back, did NOT accept 'Male'

    Core.ceoGender = 'male';
    Core.confirmIdentity('Ada', 'FEMALE');
    expect(Core.ceoGender).toBe('male'); // fell back, did NOT accept 'FEMALE'
  });
});

describe('Core.ceoDisplayName', () => {
  it('falls back to "The founder" when no name has been set', () => {
    Core.ceoName = '';
    expect(Core.ceoDisplayName).toBe('The founder');
  });

  it('uses the chosen name once set', () => {
    Core.ceoName = 'Ada';
    expect(Core.ceoDisplayName).toBe('Ada');
  });
});

describe('Core.useCeoAllHands', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('does nothing while budget is negative', () => {
    Core.budget = -1;
    Core.useCeoAllHands();
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoAllHandsTimer).toBe(0);
  });

  it('does nothing while on cooldown', () => {
    Core.budget = 1000;
    Core.ceoAllHandsCooldown = 5000;
    Core.useCeoAllHands();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('does nothing outside the playing state', () => {
    Core.state = 'paused';
    Core.budget = 1000;
    Core.useCeoAllHands();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('sets the channel timer/damage snapshot, cooldown, and use-count from the current CEO state', () => {
    Core.budget = 1000;
    const stateIndex = Core.ceoStateIndex;
    const cfg = CFG.CEO.abilities.allHands;

    Core.useCeoAllHands();

    expect(Core.ceoAllHandsTimer).toBe(cfg.durationByState[stateIndex]);
    expect(Core.ceoAllHandsDamage).toBe(cfg.damageByState[stateIndex]);
    expect(Core.ceoAllHandsCooldown).toBeGreaterThan(0);
    expect(Core.ceoAllHandsCooldown).toBe(Core.ceoAllHandsCooldownTotal);
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('gives a shorter cooldown the healthier the runway ratio', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;

    Core.budget = payroll * 3; // ratio 1, healthiest possible
    Core.useCeoAllHands();
    const healthyCooldown = Core.ceoAllHandsCooldown;

    Core.ceoAllHandsCooldown = 0;
    Core.budget = payroll * 0.3; // struggling but not negative
    Core.useCeoAllHands();
    const struggleCooldown = Core.ceoAllHandsCooldown;

    expect(healthyCooldown).toBeCloseTo(CFG.CEO.abilities.allHands.cooldownMinMs, 6);
    expect(healthyCooldown).toBeLessThan(struggleCooldown);
  });

  it('spawns the grand cast effect (rings, flash, screen banner) and plays the fanfare', () => {
    Core.budget = 1000;
    const before = Core.effects.length;
    Core.useCeoAllHands();
    const added = Core.effects.slice(before);
    expect(added.filter((fx) => fx.type === 'ring')).toHaveLength(3);
    expect(added.some((fx) => fx.type === 'flash')).toBe(true);
    expect(added.some((fx) => fx.type === 'bigPayday' && fx.text === 'ALL-HANDS!')).toBe(true);
  });
});

describe('Core.updateCeoAllHands — channeled all-enemy damage', () => {
  beforeEach(() => { Core.state = 'playing'; Core.budget = 1000; });

  it('does not throw and still sets cooldown/use-count with zero enemies', () => {
    Core.enemies = [];
    expect(() => Core.useCeoAllHands()).not.toThrow();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoAllHandsTimer).toBeGreaterThan(0);
  });

  it('damages every enemy type on each tick while channeling — bugs, competitors, AND incidents (a true "all hands", not bug-triage-only)', () => {
    const anchor = PATH.ceoAnchor;
    const bug = new Entities.Enemy('bug', PATH.waypoints, 0);
    bug.x = anchor.x + 500; bug.y = anchor.y; // distance is irrelevant — map-wide
    const bugHpBefore = bug.hp;
    const rival = new Entities.Enemy('competitor', PATH.waypoints, 0);
    rival.x = anchor.x; rival.y = anchor.y;
    const rivalHpBefore = rival.hp;
    const incident = new Entities.Enemy('incident', PATH.waypoints, 0);
    incident.x = anchor.x - 300; incident.y = anchor.y + 100;
    const incidentHpBefore = incident.hp;
    Core.enemies = [bug, rival, incident];

    Core.useCeoAllHands();
    const cfg = CFG.CEO.abilities.allHands;
    Core.updateCeoAllHands(cfg.tickIntervalMs / 1000);

    expect(bug.hp).toBeLessThan(bugHpBefore);
    expect(rival.hp).toBeLessThan(rivalHpBefore);
    expect(incident.hp).toBeLessThan(incidentHpBefore);
  });

  it('skips dead and reachedEnd enemies of any type even though they are still in the enemies array', () => {
    const anchor = PATH.ceoAnchor;
    const dead = new Entities.Enemy('bug', PATH.waypoints, 0);
    dead.x = anchor.x; dead.y = anchor.y; dead.dead = true;
    const deadHpBefore = dead.hp;
    const ended = new Entities.Enemy('competitor', PATH.waypoints, 0);
    ended.x = anchor.x; ended.y = anchor.y; ended.reachedEnd = true;
    const endedHpBefore = ended.hp;
    Core.enemies = [dead, ended];

    Core.useCeoAllHands();
    const cfg = CFG.CEO.abilities.allHands;
    Core.updateCeoAllHands(cfg.tickIntervalMs / 1000);

    expect(dead.hp).toBe(deadHpBefore);
    expect(ended.hp).toBe(endedHpBefore);
  });

  it('stops ticking once the channel duration elapses', () => {
    const anchor = PATH.ceoAnchor;
    const bug = new Entities.Enemy('bug', PATH.waypoints, 0);
    bug.x = anchor.x; bug.y = anchor.y;
    Core.enemies = [bug];

    Core.useCeoAllHands();
    Core.updateCeoAllHands(Core.ceoAllHandsTimer / 1000 + 1);
    expect(Core.ceoAllHandsTimer).toBe(0);

    const hpAfterChannelEnds = bug.hp;
    Core.updateCeoAllHands(5);
    expect(bug.hp).toBe(hpAfterChannelEnds);
  });

  it('plays one ceoAllHandsZap per tick that actually strikes something, not one per bug hit', () => {
    const anchor = PATH.ceoAnchor;
    const zap = vi.spyOn(window.Game.Audio, 'ceoAllHandsZap');
    const bugA = new Entities.Enemy('bug', PATH.waypoints, 0);
    bugA.x = anchor.x; bugA.y = anchor.y;
    const bugB = new Entities.Enemy('bug', PATH.waypoints, 0);
    bugB.x = anchor.x + 40; bugB.y = anchor.y;
    Core.enemies = [bugA, bugB];

    Core.useCeoAllHands();
    const cfg = CFG.CEO.abilities.allHands;
    Core.updateCeoAllHands(cfg.tickIntervalMs / 1000);

    expect(zap).toHaveBeenCalledTimes(1);
  });

  it('does not play ceoAllHandsZap on a tick that strikes nothing', () => {
    const zap = vi.spyOn(window.Game.Audio, 'ceoAllHandsZap');
    Core.enemies = [];
    Core.useCeoAllHands();
    const cfg = CFG.CEO.abilities.allHands;
    Core.updateCeoAllHands(cfg.tickIntervalMs / 1000);
    expect(zap).not.toHaveBeenCalled();
  });

  it('does not strike anything on a sub-tick-interval frame, only once accumulated time reaches tickIntervalMs', () => {
    const anchor = PATH.ceoAnchor;
    const bug = new Entities.Enemy('bug', PATH.waypoints, 0);
    bug.x = anchor.x; bug.y = anchor.y;
    Core.enemies = [bug];

    Core.useCeoAllHands();
    const cfg = CFG.CEO.abilities.allHands;
    const hpBefore = bug.hp;
    Core.updateCeoAllHands((cfg.tickIntervalMs / 1000) * 0.3); // well under one tick
    expect(bug.hp).toBe(hpBefore);
  });
});

describe('Core.useCeoBonuses', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('does nothing while budget is negative', () => {
    Core.budget = -1;
    Core.useCeoBonuses();
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoBonusesTimer).toBe(0);
  });

  it('does nothing while on cooldown', () => {
    Core.budget = 1000;
    Core.ceoBonusesCooldown = 5000;
    Core.useCeoBonuses();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('does nothing outside the playing state', () => {
    Core.state = 'paused';
    Core.budget = 1000;
    Core.useCeoBonuses();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('sets the buff timer/multiplier snapshot, cooldown, and use-count from the current CEO state', () => {
    Core.budget = 1000;
    const stateIndex = Core.ceoStateIndex;
    const cfg = CFG.CEO.abilities.bonuses;

    Core.useCeoBonuses();

    expect(Core.ceoBonusesTimer).toBe(cfg.durationByState[stateIndex]);
    expect(Core.ceoBonusesDmgMult).toBe(cfg.dmgMultByState[stateIndex]);
    expect(Core.ceoBonusesFireRateMult).toBe(cfg.fireRateMultByState[stateIndex]);
    expect(Core.ceoBonusesCooldown).toBeGreaterThan(0);
    expect(Core.ceoBonusesCooldown).toBe(Core.ceoBonusesCooldownTotal);
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('gives a shorter cooldown the healthier the runway ratio', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;

    Core.budget = payroll * 3;
    Core.useCeoBonuses();
    const healthyCooldown = Core.ceoBonusesCooldown;

    Core.ceoBonusesCooldown = 0;
    Core.budget = payroll * 0.3;
    Core.useCeoBonuses();
    const struggleCooldown = Core.ceoBonusesCooldown;

    expect(healthyCooldown).toBeCloseTo(CFG.CEO.abilities.bonuses.cooldownMinMs, 6);
    expect(healthyCooldown).toBeLessThan(struggleCooldown);
  });

  it('spawns one flying cashFly effect per hired tower, none when there are no towers', () => {
    Core.budget = 1000;
    Core.towers = [];
    const before = Core.effects.length;
    Core.useCeoBonuses();
    expect(Core.effects.slice(before).filter((fx) => fx.type === 'cashFly')).toHaveLength(0);

    Core.restart();
    Core.state = 'playing';
    Core.budget = 100000;
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = 1000;
    const before2 = Core.effects.length;
    Core.useCeoBonuses();
    expect(Core.effects.slice(before2).filter((fx) => fx.type === 'cashFly')).toHaveLength(1);
  });
});

describe('Core.auraDmgMultFor / auraRateMultFor — Distribute Bonuses buff', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('folds the snapshotted bonuses multipliers in while the buff is active', () => {
    Core.budget = 1000;
    Core.useCeoBonuses();
    expect(Core.auraDmgMultFor()).toBe(Core.ceoBonusesDmgMult);
    expect(Core.auraRateMultFor()).toBe(Core.ceoBonusesFireRateMult);
  });

  it('is unaffected once the buff expires', () => {
    Core.ceoBonusesTimer = 0;
    expect(Core.auraDmgMultFor()).toBe(1);
    expect(Core.auraRateMultFor()).toBe(1);
  });

  it('takes whichever effect gives the bigger boost against an active coffee aura', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.useCeoBonuses();
    const coffeeRateMult = Core.towers[0].auraRateMultValue;
    const coffeeDmgMult = Core.towers[0].auraDmgMultValue;
    expect(Core.auraRateMultFor()).toBe(Math.min(coffeeRateMult, Core.ceoBonusesFireRateMult));
    expect(Core.auraDmgMultFor()).toBe(Math.max(coffeeDmgMult, Core.ceoBonusesDmgMult));
  });

  it('a stunned coffee machine is excluded, so an active bonuses buff is the only effect applied', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.towers[0].stunTimer = 1000;
    Core.useCeoBonuses();
    expect(Core.auraRateMultFor()).toBe(Core.ceoBonusesFireRateMult);
    expect(Core.auraDmgMultFor()).toBe(Core.ceoBonusesDmgMult);
  });

  it('neither effect active yields exactly 1 (no towers at all)', () => {
    Core.towers = [];
    Core.ceoBonusesTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
    expect(Core.auraDmgMultFor()).toBe(1);
  });
});

describe('Core.useCeoFixBugs', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('does nothing while budget is negative', () => {
    Core.budget = -1;
    Core.useCeoFixBugs();
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoFixBugsTimer).toBe(0);
  });

  it('does nothing while on cooldown', () => {
    Core.budget = 1000;
    Core.ceoFixBugsCooldown = 5000;
    Core.useCeoFixBugs();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('does nothing outside the playing state', () => {
    Core.state = 'paused';
    Core.budget = 1000;
    Core.useCeoFixBugs();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('sets the attack-mode timer/damage/range snapshot, cooldown, and use-count from the current CEO state', () => {
    Core.budget = 1000;
    const stateIndex = Core.ceoStateIndex;
    const cfg = CFG.CEO.abilities.fixBugs;

    Core.useCeoFixBugs();

    expect(Core.ceoFixBugsTimer).toBe(cfg.durationByState[stateIndex]);
    expect(Core.ceoFixBugsDamage).toBe(cfg.damageByState[stateIndex]);
    expect(Core.ceoFixBugsRange).toBe(cfg.rangeByState[stateIndex]);
    expect(Core.ceoFixBugsCooldown).toBeGreaterThan(0);
    expect(Core.ceoFixBugsCooldown).toBe(Core.ceoFixBugsCooldownTotal);
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('gives a shorter cooldown the healthier the runway ratio', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;

    Core.budget = payroll * 3;
    Core.useCeoFixBugs();
    const healthyCooldown = Core.ceoFixBugsCooldown;

    Core.ceoFixBugsCooldown = 0;
    Core.budget = payroll * 0.3;
    Core.useCeoFixBugs();
    const struggleCooldown = Core.ceoFixBugsCooldown;

    expect(healthyCooldown).toBeCloseTo(CFG.CEO.abilities.fixBugs.cooldownMinMs, 6);
    expect(healthyCooldown).toBeLessThan(struggleCooldown);
  });
});

describe('Core.updateCeoFixBugs — furthest-along targeting, chain, and slow', () => {
  beforeEach(() => { Core.state = 'playing'; Core.budget = 1000; });

  it('does nothing when no enemy is within range', () => {
    Core.useCeoFixBugs();
    Core.enemies = [];
    expect(() => Core.updateCeoFixBugs(1)).not.toThrow();
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('targets the enemy furthest along the path within range, damages and slows it', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const near = new Entities.Enemy('bug', PATH.waypoints, 0);
    near.x = anchor.x; near.y = anchor.y; near.wpIndex = 0;
    const ahead = new Entities.Enemy('bug', PATH.waypoints, 0);
    ahead.x = anchor.x; ahead.y = anchor.y; ahead.wpIndex = 3;
    const ahead0Hp = ahead.hp;
    Core.enemies = [near, ahead];

    Core.updateCeoFixBugs(0);

    expect(ahead.hp).toBeLessThan(ahead0Hp);
    expect(ahead.slowFactor).toBeGreaterThan(0);
  });

  it('plays ceoFixBugsZap when a shot actually connects, not when nothing is in range', () => {
    const anchor = PATH.ceoAnchor;
    const zap = vi.spyOn(window.Game.Audio, 'ceoFixBugsZap');
    Core.useCeoFixBugs();
    Core.enemies = [];
    Core.updateCeoFixBugs(0);
    expect(zap).not.toHaveBeenCalled();

    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = anchor.x; target.y = anchor.y;
    Core.enemies = [target];
    Core.updateCeoFixBugs(0);
    expect(zap).toHaveBeenCalledTimes(1);
  });

  it('ignores enemies outside range', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const far = new Entities.Enemy('bug', PATH.waypoints, 0);
    far.x = anchor.x + Core.ceoFixBugsRange + 1000; far.y = anchor.y;
    const farHpBefore = far.hp;
    Core.enemies = [far];

    Core.updateCeoFixBugs(0);

    expect(far.hp).toBe(farHpBefore);
  });

  it('skips dead and reachedEnd enemies in the targeting loop even when they sit right on top of the CEO', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const dead = new Entities.Enemy('bug', PATH.waypoints, 0);
    dead.x = anchor.x; dead.y = anchor.y; dead.dead = true;
    const deadHpBefore = dead.hp;
    const ended = new Entities.Enemy('bug', PATH.waypoints, 0);
    ended.x = anchor.x; ended.y = anchor.y; ended.reachedEnd = true;
    const endedHpBefore = ended.hp;
    Core.enemies = [dead, ended];

    Core.updateCeoFixBugs(0);

    expect(dead.hp).toBe(deadHpBefore);
    expect(ended.hp).toBe(endedHpBefore);
  });

  it('chains to one nearby enemy with falloff damage', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const cfg = CFG.CEO.abilities.fixBugs;
    const primary = new Entities.Enemy('bug', PATH.waypoints, 0);
    primary.x = anchor.x; primary.y = anchor.y; primary.wpIndex = 3;
    const chainTarget = new Entities.Enemy('bug', PATH.waypoints, 0);
    chainTarget.x = primary.x + cfg.chainRange - 5; chainTarget.y = primary.y; chainTarget.wpIndex = 0;
    const chainHpBefore = chainTarget.hp;
    Core.enemies = [primary, chainTarget];

    Core.updateCeoFixBugs(0);

    expect(chainTarget.hp).toBeLessThan(chainHpBefore);
    expect(chainTarget.hp).toBeGreaterThan(chainHpBefore - Core.ceoFixBugsDamage);
  });

  it('picks the closer of two chain candidates, leaving the farther one (outside the running chainDist) untouched', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const cfg = CFG.CEO.abilities.fixBugs;
    const primary = new Entities.Enemy('bug', PATH.waypoints, 0);
    primary.x = anchor.x; primary.y = anchor.y; primary.wpIndex = 3;
    const closeChain = new Entities.Enemy('bug', PATH.waypoints, 0);
    closeChain.x = primary.x + 5; closeChain.y = primary.y; closeChain.wpIndex = 0;
    const closeChainHpBefore = closeChain.hp;
    const farChain = new Entities.Enemy('bug', PATH.waypoints, 0);
    farChain.x = primary.x + cfg.chainRange - 10; farChain.y = primary.y; farChain.wpIndex = 0;
    const farChainHpBefore = farChain.hp;
    Core.enemies = [primary, closeChain, farChain];

    Core.updateCeoFixBugs(0);

    expect(closeChain.hp).toBeLessThan(closeChainHpBefore);
    expect(farChain.hp).toBe(farChainHpBefore);
  });

  it('is gated by its own fire-rate cooldown between shots', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = anchor.x; target.y = anchor.y;
    Core.enemies = [target];

    Core.updateCeoFixBugs(0);
    const hpAfterFirstShot = target.hp;
    Core.updateCeoFixBugs(0);
    expect(target.hp).toBe(hpAfterFirstShot);
  });

  it('stops attacking once the attack-mode duration elapses', () => {
    const anchor = PATH.ceoAnchor;
    Core.useCeoFixBugs();
    Core.updateCeoFixBugs(Core.ceoFixBugsTimer / 1000 + 1);
    expect(Core.ceoFixBugsTimer).toBe(0);

    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = anchor.x; target.y = anchor.y;
    const hpBefore = target.hp;
    Core.enemies = [target];
    Core.updateCeoFixBugs(5);
    expect(target.hp).toBe(hpBefore);
  });
});

describe('Core.triggerAllHandsEffect — effect lifecycle does not leak', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('calling it many times back-to-back (bypassing the cooldown guard) still gets every effect pruned once its life elapses', () => {
    const anchor = PATH.ceoAnchor;
    // Call the effect-pushing method directly (not useCeoAbility(), which
    // is cooldown-gated) to simulate the leak scenario: many bursts firing
    // in immediate succession.
    for (let i = 0; i < 25; i++) Core.triggerAllHandsEffect(anchor);

    // 3 rings + 1 flash + 1 bigPayday per call = 5 new effects each time.
    expect(Core.effects.length).toBe(25 * 5);
    const newTypes = ['ring', 'flash', 'bigPayday'];
    expect(Core.effects.filter((fx) => newTypes.includes(fx.type)).length).toBe(25 * 5);

    // The longest-lived effect here is bigPayday at 1.8s life. Advancing
    // update() past that must prune ALL of them via the generic
    // `fx.life > 0` filter in update() — not just the old effect types.
    Core.update(2.0);
    expect(Core.effects.filter((fx) => newTypes.includes(fx.type))).toHaveLength(0);
    expect(Core.effects).toHaveLength(0);
  });

  it('effects accumulated across many bursts are pruned incrementally, not left to grow unboundedly across frames', () => {
    const anchor = PATH.ceoAnchor;
    Core.triggerAllHandsEffect(anchor); // life values: rings 0.5/0.7/0.9, flash 0.3, bigPayday 1.8
    Core.update(0.2); // nothing has expired yet (shortest life is flash at 0.3)
    expect(Core.effects.length).toBe(5);

    Core.triggerAllHandsEffect(anchor); // 5 more added on top of the still-alive 5
    expect(Core.effects.length).toBe(10);

    Core.update(0.35); // first burst's flash(0.3) and ring(0.5) expire relative to their own countdowns
    // Exact survivors depend on per-fx life, but the count must strictly
    // decrease (proof effects are actually being pruned, not just piling up).
    expect(Core.effects.length).toBeLessThan(10);

    Core.update(5); // more than long enough for everything remaining to expire
    expect(Core.effects).toHaveLength(0);
  });

  it('an effect pushed by updateCeo (via Core.update) is pruned in that SAME call, not left dangling an extra frame (code-review catch)', () => {
    // Core.update()'s generic effect-decay/prune pass must run AFTER
    // updateCeo(dt) — the only step that can push new effects — so a
    // lightning bolt created this frame is subject to this same frame's
    // decrement, exactly like every other effect-producing step (tower
    // attacks) already is.
    Core.state = 'playing';
    Core.budget = 1000;
    const anchor = PATH.ceoAnchor;
    const bug = new Entities.Enemy('bug', PATH.waypoints, 0);
    bug.x = anchor.x; bug.y = anchor.y;
    Core.enemies = [bug];
    Core.useCeoAllHands();

    const cfg = CFG.CEO.abilities.allHands;
    // dt both crosses the tick interval (so a lightning effect, life 0.16,
    // gets pushed by updateCeoAllHands during this very call) AND, being
    // far larger than that effect's own life, would prune it immediately
    // if the decay pass runs after updateCeo — proving the two run in the
    // right order within a single Core.update() call.
    Core.update(cfg.tickIntervalMs / 1000);

    expect(Core.effects.filter((fx) => fx.type === 'lightning')).toHaveLength(0);
  });
});

describe('CEO abilities — repeated calls do not compound/stack', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('a second immediate All-Hands call while on cooldown changes nothing', () => {
    Core.budget = 1000;
    Core.useCeoAllHands();
    const timerAfterFirst = Core.ceoAllHandsTimer;
    const cooldownAfterFirst = Core.ceoAllHandsCooldown;
    Core.useCeoAllHands(); // still on cooldown
    Core.useCeoAllHands();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoAllHandsTimer).toBe(timerAfterFirst);
    expect(Core.ceoAllHandsCooldown).toBe(cooldownAfterFirst);
  });

  it('a second immediate Bonuses call while on cooldown changes nothing', () => {
    Core.budget = 1000;
    Core.useCeoBonuses();
    const timerAfterFirst = Core.ceoBonusesTimer;
    const cooldownAfterFirst = Core.ceoBonusesCooldown;
    Core.useCeoBonuses();
    Core.useCeoBonuses();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoBonusesTimer).toBe(timerAfterFirst);
    expect(Core.ceoBonusesCooldown).toBe(cooldownAfterFirst);
  });

  it('a second immediate Fix Bugs call while on cooldown changes nothing', () => {
    Core.budget = 1000;
    Core.useCeoFixBugs();
    const timerAfterFirst = Core.ceoFixBugsTimer;
    const cooldownAfterFirst = Core.ceoFixBugsCooldown;
    Core.useCeoFixBugs();
    Core.useCeoFixBugs();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoFixBugsTimer).toBe(timerAfterFirst);
    expect(Core.ceoFixBugsCooldown).toBe(cooldownAfterFirst);
  });

  it('all 3 abilities can be active independently at once (no mutual exclusion)', () => {
    Core.budget = 1000;
    Core.useCeoAllHands();
    Core.useCeoBonuses();
    Core.useCeoFixBugs();
    expect(Core.ceoAllHandsTimer).toBeGreaterThan(0);
    expect(Core.ceoBonusesTimer).toBeGreaterThan(0);
    expect(Core.ceoFixBugsTimer).toBeGreaterThan(0);
    expect(Core.stats.ceoAbilityUses).toBe(3);
  });

  it('repeated restart() calls in sequence leave CEO run state cleanly zeroed, not compounded', () => {
    Core.budget = 1000;
    Core.useCeoAllHands();
    Core.useCeoBonuses();
    Core.useCeoFixBugs();
    Core.restart();
    Core.restart();
    Core.restart();
    expect(Core.ceoAllHandsCooldown).toBe(0);
    expect(Core.ceoAllHandsTimer).toBe(0);
    expect(Core.ceoBonusesCooldown).toBe(0);
    expect(Core.ceoBonusesTimer).toBe(0);
    expect(Core.ceoFixBugsCooldown).toBe(0);
    expect(Core.ceoFixBugsTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoIncomeTimer).toBe(0);
  });
});

describe('Core.updateCeo — per-ability cooldown/timer decrement', () => {
  beforeEach(() => { Core.state = 'playing'; Core.budget = 1000; });

  it('counts down all 3 cooldowns and the bonuses buff timer together via a single updateCeo call', () => {
    Core.useCeoAllHands();
    Core.useCeoBonuses();
    Core.useCeoFixBugs();
    const allHandsBefore = Core.ceoAllHandsCooldown;
    const bonusesBefore = Core.ceoBonusesCooldown;
    const fixBugsBefore = Core.ceoFixBugsCooldown;
    const bonusesTimerBefore = Core.ceoBonusesTimer;

    Core.updateCeo(0.5);

    expect(Core.ceoAllHandsCooldown).toBeLessThan(allHandsBefore);
    expect(Core.ceoBonusesCooldown).toBeLessThan(bonusesBefore);
    expect(Core.ceoFixBugsCooldown).toBeLessThan(fixBugsBefore);
    expect(Core.ceoBonusesTimer).toBeLessThan(bonusesTimerBefore);
  });

  it('clamps every cooldown/timer at 0, never going negative on a large dt', () => {
    Core.useCeoAllHands();
    Core.useCeoBonuses();
    Core.useCeoFixBugs();

    Core.updateCeo(1000);

    expect(Core.ceoAllHandsCooldown).toBe(0);
    expect(Core.ceoBonusesCooldown).toBe(0);
    expect(Core.ceoFixBugsCooldown).toBe(0);
    expect(Core.ceoBonusesTimer).toBe(0);
  });
});

describe('Core.updateCeo — income timer carryover across a single large dt', () => {
  it('a dt covering exactly 2.5x the income interval only pays out once per updateCeo call (timer does not loop internally)', () => {
    // Documents actual behavior of the `if (timer >= interval)` check in
    // updateCeo (js/game.js) rather than a `while` loop — provably
    // unreachable through the real game loop, which hard-clamps dt to at
    // most 0.05s * 4x speed = 0.2s, far below any realistic interval; see
    // js/game.js's loop(). Kept as documentation, not a bug report.
    Core.budget = 0; // Bootstrapping, state 1
    const before = Core.budget;
    const intervalSec = CFG.CEO.incomeIntervalMs / 1000;
    Core.updateCeo(intervalSec * 2.5);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]); // only ONE payout, not two
    expect(Core.stats.income).toBe(CFG.CEO.incomeByState[1]);
    expect(Core.ceoIncomeTimer).toBeCloseTo(CFG.CEO.incomeIntervalMs * 1.5, 6);
    Core.updateCeo(0);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1] * 2);
  });

  it('carries a sub-interval remainder forward across two smaller calls that together cross the interval', () => {
    Core.budget = 0;
    const before = Core.budget;
    const intervalSec = CFG.CEO.incomeIntervalMs / 1000;
    Core.updateCeo(intervalSec * 0.6);
    expect(Core.budget).toBe(before); // not yet due
    Core.updateCeo(intervalSec * 0.5); // 0.6 + 0.5 = 1.1x -> one payout, 0.1x carried
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]);
    expect(Core.ceoIncomeTimer).toBeCloseTo(CFG.CEO.incomeIntervalMs * 0.1, 6);
  });
});

describe('Core.updateCeo — milestone toasts', () => {
  beforeEach(() => { document.getElementById('toast').textContent = ''; });

  it('fires a toast the first time a new peak state is reached this run', () => {
    Core.ceoName = 'Ada';
    Core.budget = CFG.CEO.wealthThresholds[0]; // Growing (2)
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toContain('Ada');
  });

  it('does not re-fire when dropping back into an already-reached tier', () => {
    Core.budget = CFG.CEO.wealthThresholds[2]; // Successful (4) — new peak
    Core.updateCeo(0.1);
    document.getElementById('toast').textContent = '';
    Core.budget = CFG.CEO.wealthThresholds[0]; // drop to Growing (2), still below the peak
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toBe('');
  });

  it('does not fire a milestone toast for Bootstrapping (the starting tier)', () => {
    Core.budget = 0; // Bootstrapping (1)
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toBe('');
  });

  it('oscillating rapidly across the same threshold many times only toasts once, not per crossing', () => {
    const t = CFG.CEO.wealthThresholds;
    let toastCount = 0;
    const toastEl = document.getElementById('toast');
    // Crude toast-fire counter: textContent changing to a non-empty value
    // counts as a fire; clear it after every updateCeo call like the other
    // toast tests do, so a repeat fire would be visible.
    for (let i = 0; i < 10; i++) {
      Core.budget = i % 2 === 0 ? t[0] : t[0] - 1; // hop across the Growing boundary
      toastEl.textContent = '';
      Core.updateCeo(0.1);
      if (toastEl.textContent !== '') toastCount++;
    }
    expect(toastCount).toBe(1); // only the very first crossing (new peak) fires
    expect(Core.stats.ceoPeakState).toBe(2); // Growing, the highest tier actually reached
  });

  it('dropping to Crisis and recovering, then reaching a NEW peak above the old one, still toasts correctly', () => {
    const t = CFG.CEO.wealthThresholds;
    const toastEl = document.getElementById('toast');

    Core.budget = t[0]; // Growing (2) — first peak
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toContain("'s startup is starting to take off.");
    expect(Core.stats.ceoPeakState).toBe(2);

    Core.budget = -1; // Crisis (0) — drop far below the peak
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toBe(''); // no milestone toast for dropping down
    expect(Core.stats.ceoPeakState).toBe(2); // peak unchanged by a drop

    Core.budget = t[2]; // Successful (4) — a genuinely NEW peak above the old one
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toContain(' just became a certified Successful founder.');
    expect(Core.stats.ceoPeakState).toBe(4);
  });
});

describe('Core.update — Crisis-entry toast', () => {
  it('fires once, personalized, the frame budget first goes negative', () => {
    Core.state = 'playing';
    Core.ceoName = 'Ada';
    Core.budget = -1;
    document.getElementById('toast').textContent = '';
    Core.update(0.1);
    expect(document.getElementById('toast').textContent).toContain('Ada');
  });

  it('does not re-fire on a later frame while still negative', () => {
    Core.state = 'playing';
    Core.budget = -1;
    Core.update(0.1); // enters crisis, grace timer starts
    document.getElementById('toast').textContent = '';
    Core.update(0.1); // still negative, same grace period
    expect(document.getElementById('toast').textContent).toBe('');
  });
});

describe('Core.auraRateMultFor / auraDmgMultFor — a hired coffee machine alone does not move these', () => {
  it('a coffee machine with no active CEO bonuses buff leaves both at the neutral 1x — coffee\'s boost is personal per-recipient now, not read through here', () => {
    Core.state = 'playing';
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.ceoBonusesTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
    expect(Core.auraDmgMultFor()).toBe(1);
  });
});

describe('Core.restart resets CEO run state but keeps the identity preferences', () => {
  it('resets ability/buff/income timers and per-run stats, keeps gender/name', () => {
    Core.confirmIdentity('Ada', 'female');
    Core.ceoAllHandsCooldown = 5000;
    Core.ceoAllHandsTimer = 3000;
    Core.ceoBonusesCooldown = 5000;
    Core.ceoBonusesTimer = 2000;
    Core.ceoFixBugsCooldown = 5000;
    Core.ceoFixBugsTimer = 2000;
    Core.stats.ceoAbilityUses = 3;
    Core.stats.ceoCrisisMs = 4000;
    Core.stats.ceoPeakState = 5;

    Core.restart();

    expect(Core.ceoGender).toBe('female');
    expect(Core.ceoName).toBe('Ada');
    expect(Core.stats.ceoGender).toBe('female');
    expect(Core.ceoAllHandsCooldown).toBe(0);
    expect(Core.ceoAllHandsTimer).toBe(0);
    expect(Core.ceoBonusesCooldown).toBe(0);
    expect(Core.ceoBonusesTimer).toBe(0);
    expect(Core.ceoFixBugsCooldown).toBe(0);
    expect(Core.ceoFixBugsTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.stats.ceoCrisisMs).toBe(0);
    expect(Core.stats.ceoPeakState).toBe(0);
  });

  it('closes a still-open ability menu instead of leaving it floating over the fresh run (code-review catch)', () => {
    Game.UI.init(Core);
    Core.ceoMenuOpen = true;
    Game.UI.showCeoAbilityPanel(true);
    expect(document.getElementById('ceoAbilityPanel').classList.contains('hidden')).toBe(false);

    Core.restart();

    expect(Core.ceoMenuOpen).toBe(false);
    expect(document.getElementById('ceoAbilityPanel').classList.contains('hidden')).toBe(true);
  });
});

describe('Core.gameOver closes a still-open ability menu (code-review catch)', () => {
  it('hides the panel and clears ceoMenuOpen so it cannot reappear stuck behind the game-over screen', () => {
    Game.UI.init(Core);
    Core.state = 'playing';
    Core.ceoMenuOpen = true;
    Game.UI.showCeoAbilityPanel(true);
    expect(document.getElementById('ceoAbilityPanel').classList.contains('hidden')).toBe(false);

    Core.gameOver('bankrupt');

    expect(Core.ceoMenuOpen).toBe(false);
    expect(document.getElementById('ceoAbilityPanel').classList.contains('hidden')).toBe(true);
  });
});
