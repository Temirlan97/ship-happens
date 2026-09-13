import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core, Entities;

beforeEach(() => {
  // ceoGender persists via localStorage across loadGame() calls by design
  // (see js/game.js's loadCeoGender) — clear it so state-index/ability
  // tests (which don't care about gender) aren't affected by whatever a
  // previous test in this file left behind.
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

describe('Core.ceoStateIndex', () => {
  it('is Crisis (0) whenever budget is negative, overriding stage/milestone', () => {
    Core.budget = -1;
    Core.acquisitionMilestoneIndex = 3;
    expect(Core.ceoStateIndex).toBe(0);
  });

  it('is Bootstrapping (1) at Pre-Seed with non-negative budget', () => {
    Core.budget = 0;
    expect(Core.waves.stage.key).toBe('preseed');
    expect(Core.ceoStateIndex).toBe(1);
  });

  it('is Growing (2) at Seed or Series A', () => {
    Core.budget = 0;
    Core.waves.waveIndex = 2; // displayWaveNumber 3 -> Seed
    expect(Core.waves.stage.key).toBe('seed');
    expect(Core.ceoStateIndex).toBe(2);
    Core.waves.waveIndex = 4; // -> Series A
    expect(Core.waves.stage.key).toBe('seriesA');
    expect(Core.ceoStateIndex).toBe(2);
  });

  it('is Established (3) at Series B/C/Scale-Up with no milestone crossed yet', () => {
    Core.budget = 0;
    Core.waves.waveIndex = 6; // Series B
    expect(Core.ceoStateIndex).toBe(3);
    Core.waves.waveIndex = 10; // Scale-Up
    expect(Core.ceoStateIndex).toBe(3);
  });

  it('is Successful (4) once the first acquisition milestone is crossed', () => {
    Core.budget = 0;
    Core.acquisitionMilestoneIndex = 1;
    expect(Core.ceoStateIndex).toBe(4);
  });

  it('is Tycoon (5) from the second acquisition milestone onward', () => {
    Core.budget = 0;
    Core.acquisitionMilestoneIndex = 2;
    expect(Core.ceoStateIndex).toBe(5);
    Core.acquisitionMilestoneIndex = 7;
    expect(Core.ceoStateIndex).toBe(5);
  });
});

describe('Core.setCeoGender', () => {
  it('sets ceoGender and mirrors it onto stats.ceoGender', () => {
    Core.setCeoGender('female');
    expect(Core.ceoGender).toBe('female');
    expect(Core.stats.ceoGender).toBe('female');
  });

  it('ignores an invalid value', () => {
    Core.setCeoGender('male');
    Core.setCeoGender('robot');
    expect(Core.ceoGender).toBe('male');
  });

  it('persists across a fresh load via localStorage, unlike run-scoped CEO state', () => {
    Core.setCeoGender('female');
    const reloaded = loadGame();
    expect(reloaded.Core.ceoGender).toBe('female');
  });
});

describe('Core.useCeoAbility', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('does nothing while budget is negative', () => {
    Core.budget = -1;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
  });

  it('does nothing while on cooldown', () => {
    Core.budget = 1000;
    Core.ceoAbilityCooldown = 5000;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('does nothing outside the playing state', () => {
    Core.state = 'paused';
    Core.budget = 1000;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('damages enemies within radius, leaves far ones untouched, and sets buff/cooldown/use-count', () => {
    Core.budget = 1000;
    const anchor = PATH.ceoAnchor;
    const near = new Entities.Enemy('bug', PATH.waypoints, 0);
    near.x = anchor.x + 10; near.y = anchor.y;
    const nearHpBefore = near.hp;
    const far = new Entities.Enemy('bug', PATH.waypoints, 0);
    far.x = anchor.x + CFG.CEO.abilityRadius + 500; far.y = anchor.y;
    const farHpBefore = far.hp;
    Core.enemies = [near, far];

    Core.useCeoAbility();

    expect(near.hp).toBeLessThan(nearHpBefore);
    expect(far.hp).toBe(farHpBefore);
    expect(Core.ceoBuffTimer).toBe(CFG.CEO.abilityBuffDurationMs);
    expect(Core.ceoAbilityCooldown).toBeGreaterThan(0);
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('gives a shorter cooldown the healthier the runway ratio', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;

    Core.budget = payroll * 3; // ratio 1, healthiest possible
    Core.useCeoAbility();
    const healthyCooldown = Core.ceoAbilityCooldown;

    Core.ceoAbilityCooldown = 0;
    Core.budget = payroll * 0.3; // struggling but not negative
    Core.useCeoAbility();
    const struggleCooldown = Core.ceoAbilityCooldown;

    expect(healthyCooldown).toBeCloseTo(CFG.CEO.abilityCooldownMinMs, 6);
    expect(healthyCooldown).toBeLessThan(struggleCooldown);
  });
});

describe('Core.updateCeo', () => {
  it('ticks down the ability cooldown and buff timer, clamped at 0', () => {
    Core.ceoAbilityCooldown = 1000;
    Core.ceoBuffTimer = 500;
    Core.updateCeo(0.6);
    expect(Core.ceoAbilityCooldown).toBe(400);
    expect(Core.ceoBuffTimer).toBe(0);
  });

  it('pays passive income on interval while budget is non-negative, sized by state', () => {
    Core.budget = 0; // Bootstrapping (state 1)
    const before = Core.budget;
    Core.updateCeo(CFG.CEO.incomeIntervalMs / 1000);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]);
    expect(Core.stats.income).toBe(CFG.CEO.incomeByState[1]);
  });

  it('pays no income while budget is negative, and accumulates crisis time instead', () => {
    Core.budget = -500;
    const before = Core.budget;
    Core.updateCeo(2);
    expect(Core.budget).toBe(before);
    expect(Core.stats.ceoCrisisMs).toBe(2000);
  });

  it('tracks the highest state index reached this run, never lowering it', () => {
    Core.budget = 0;
    Core.acquisitionMilestoneIndex = 1; // Successful (4)
    Core.updateCeo(0.1);
    expect(Core.stats.ceoPeakState).toBe(4);

    Core.acquisitionMilestoneIndex = 0;
    Core.budget = -1; // Crisis (0) now, but the run's peak already hit 4
    Core.updateCeo(0.1);
    expect(Core.stats.ceoPeakState).toBe(4);
  });
});

describe('Core.auraRateMultFor with an active CEO buff', () => {
  it('folds the ability buff multiplier in, same hook the coffee aura already uses', () => {
    Core.ceoBuffTimer = 1000;
    expect(Core.auraRateMultFor()).toBe(CFG.CEO.abilityBuffFireRateMult);
  });

  it('is unaffected once the buff expires', () => {
    Core.ceoBuffTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
  });

  it('takes whichever effect gives the bigger speed boost (the smaller multiplier)', () => {
    Core.budget = 100000; // coffee machine costs more than START_BUDGET
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.ceoBuffTimer = 1000;
    const coffeeMult = Core.towers[0].auraRateMultValue;
    expect(Core.auraRateMultFor()).toBe(Math.min(coffeeMult, CFG.CEO.abilityBuffFireRateMult));
  });
});

describe('Core.ceoStateIndex — exact boundary crossings', () => {
  it('flips preseed->seed exactly at the waveIndex where displayWaveNumber hits triggerSprint 3', () => {
    Core.budget = 0;
    Core.waves.waveIndex = 1; // displayWaveNumber 2, still below seed's triggerSprint (3)
    expect(Core.waves.stage.key).toBe('preseed');
    expect(Core.ceoStateIndex).toBe(1);
    Core.waves.waveIndex = 2; // displayWaveNumber 3 -> seed
    expect(Core.waves.stage.key).toBe('seed');
    expect(Core.ceoStateIndex).toBe(2);
  });

  it('flips seriesA->seriesB exactly at the waveIndex where displayWaveNumber hits triggerSprint 7 (both Growing/Established map to different states)', () => {
    Core.budget = 0;
    Core.waves.waveIndex = 5; // displayWaveNumber 6, still seriesA
    expect(Core.waves.stage.key).toBe('seriesA');
    expect(Core.ceoStateIndex).toBe(2);
    Core.waves.waveIndex = 6; // displayWaveNumber 7 -> seriesB
    expect(Core.waves.stage.key).toBe('seriesB');
    expect(Core.ceoStateIndex).toBe(3);
  });

  it('flips Established->Successful exactly when acquisitionMilestoneIndex crosses 0->1', () => {
    Core.budget = 0;
    Core.waves.waveIndex = 6; // seriesB, would otherwise be Established (3)
    Core.acquisitionMilestoneIndex = 0;
    expect(Core.ceoStateIndex).toBe(3);
    Core.acquisitionMilestoneIndex = 1;
    expect(Core.ceoStateIndex).toBe(4);
  });

  it('flips Successful->Tycoon exactly when acquisitionMilestoneIndex crosses 1->2', () => {
    Core.budget = 0;
    Core.acquisitionMilestoneIndex = 1;
    expect(Core.ceoStateIndex).toBe(4);
    Core.acquisitionMilestoneIndex = 2;
    expect(Core.ceoStateIndex).toBe(5);
  });

  it('treats budget exactly at 0 as non-Crisis, and the smallest negative amount as Crisis', () => {
    Core.budget = 0;
    expect(Core.ceoStateIndex).not.toBe(0);
    Core.budget = -0.01;
    expect(Core.ceoStateIndex).toBe(0);
  });
});

describe('Core.useCeoAbility — enemy loop edge cases', () => {
  beforeEach(() => { Core.state = 'playing'; Core.budget = 1000; });

  it('does not throw and still sets buff/cooldown/use-count with zero enemies', () => {
    Core.enemies = [];
    expect(() => Core.useCeoAbility()).not.toThrow();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoBuffTimer).toBe(CFG.CEO.abilityBuffDurationMs);
  });

  it('skips dead and reachedEnd enemies even when they sit inside the radius', () => {
    const anchor = PATH.ceoAnchor;
    const dead = new Entities.Enemy('bug', PATH.waypoints, 0);
    dead.x = anchor.x; dead.y = anchor.y; dead.dead = true;
    const deadHpBefore = dead.hp;
    const ended = new Entities.Enemy('bug', PATH.waypoints, 0);
    ended.x = anchor.x; ended.y = anchor.y; ended.reachedEnd = true;
    const endedHpBefore = ended.hp;
    Core.enemies = [dead, ended];

    Core.useCeoAbility();

    expect(dead.hp).toBe(deadHpBefore);
    expect(ended.hp).toBe(endedHpBefore);
  });
});

describe('Core.useCeoAbility — repeated calls do not compound/stack', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('a second immediate call while on cooldown changes nothing (buff timer does not stack, use-count does not increment)', () => {
    Core.budget = 1000;
    Core.useCeoAbility();
    const buffAfterFirst = Core.ceoBuffTimer;
    const cooldownAfterFirst = Core.ceoAbilityCooldown;
    Core.useCeoAbility(); // still on cooldown
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoBuffTimer).toBe(buffAfterFirst);
    expect(Core.ceoAbilityCooldown).toBe(cooldownAfterFirst);
  });

  it('repeated restart() calls in sequence leave CEO run state cleanly zeroed, not compounded', () => {
    Core.budget = 1000;
    Core.useCeoAbility();
    Core.restart();
    Core.restart();
    Core.restart();
    expect(Core.ceoAbilityCooldown).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoIncomeTimer).toBe(0);
  });
});

describe('Core.updateCeo — income timer carryover across a single large dt', () => {
  it('a dt covering exactly 2.5x the income interval only pays out once per updateCeo call (timer does not loop internally)', () => {
    // This documents actual behavior of the `if (timer >= interval)` check in
    // updateCeo (js/game.js) rather than a `while` loop: a single call with a
    // dt many multiples of the interval pays at most one tick, leaving the
    // remainder >= interval for the *next* call to immediately pay again.
    Core.budget = 0; // Bootstrapping, state 1
    const before = Core.budget;
    const intervalSec = CFG.CEO.incomeIntervalMs / 1000;
    Core.updateCeo(intervalSec * 2.5);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]); // only ONE payout, not two
    expect(Core.stats.income).toBe(CFG.CEO.incomeByState[1]);
    // leftover timer is 1.5x the interval — still >= interval, so the very
    // next call (even with dt=0) pays again immediately instead of waiting.
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

describe('Core.auraRateMultFor — CEO buff + coffee aura interaction', () => {
  it('a stunned coffee machine is excluded, so an active CEO buff is the only effect applied', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.towers[0].stunTimer = 1000; // stunned -> excluded from the aura loop
    Core.ceoBuffTimer = 1000;
    expect(Core.auraRateMultFor()).toBe(CFG.CEO.abilityBuffFireRateMult);
  });

  it('an active coffee aura with no CEO buff yields just the coffee multiplier', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.ceoBuffTimer = 0;
    const coffeeMult = Core.towers[0].auraRateMultValue;
    expect(Core.auraRateMultFor()).toBe(coffeeMult);
  });

  it('neither effect active yields exactly 1 (no towers at all)', () => {
    Core.towers = [];
    Core.ceoBuffTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
  });
});

describe('Core.restart resets CEO run state but keeps the gender preference', () => {
  it('resets ability/buff/income timers and per-run stats', () => {
    Core.setCeoGender('female');
    Core.ceoAbilityCooldown = 5000;
    Core.ceoBuffTimer = 2000;
    Core.stats.ceoAbilityUses = 3;
    Core.stats.ceoCrisisMs = 4000;
    Core.stats.ceoPeakState = 5;

    Core.restart();

    expect(Core.ceoGender).toBe('female');
    expect(Core.stats.ceoGender).toBe('female');
    expect(Core.ceoAbilityCooldown).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.stats.ceoCrisisMs).toBe(0);
    expect(Core.stats.ceoPeakState).toBe(0);
  });
});
