import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core, Entities;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  PATH = Game.Path;
  Core = Game.Core;
  Entities = Game.Entities;
  PATH.relayout(1600, 1000);
});

describe('Core.addBudget', () => {
  it('increases budget and the cumulative income stat by the same amount', () => {
    const before = Core.budget;
    Core.addBudget(500);
    expect(Core.budget).toBe(before + 500);
    expect(Core.stats.income).toBe(500);
  });
});

describe('Core.stealBudget', () => {
  it('removes the given percentage of the current budget, tracked as a loss', () => {
    Core.budget = 1000;
    Core.stealBudget(0.08);
    expect(Core.budget).toBe(1000 - Math.round(1000 * 0.08));
    expect(Core.stats.lost).toBe(Math.round(1000 * 0.08));
  });

  it('never takes the budget below zero', () => {
    Core.budget = 10;
    Core.stealBudget(0.5);
    expect(Core.budget).toBeGreaterThanOrEqual(0);
  });
});

describe('Core.processPayday', () => {
  it('deducts the sum of every hired tower salary and tracks it as paid', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const salary = Core.towers[0].salary;
    const before = Core.budget;
    Core.processPayday();
    expect(Core.budget).toBe(before - salary);
    expect(Core.stats.salaries).toBe(salary);
  });

  it('does nothing with no hired teammates', () => {
    const before = Core.budget;
    Core.processPayday();
    expect(Core.budget).toBe(before);
    expect(Core.stats.salaries).toBe(0);
  });
});

describe('Core.onEnemyLeaked', () => {
  it('deducts the leaked enemy leakCost from budget and tracks it as lost', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    const before = Core.budget;
    Core.onEnemyLeaked(e);
    expect(Core.budget).toBe(before - e.leakCost);
    expect(Core.stats.lost).toBe(e.leakCost);
  });

  it('a leaked competitor additionally steals a percentage of the remaining budget', () => {
    const e = new Entities.Enemy('competitor', PATH.waypoints, 0);
    const startBudget = e.leakCost + 10000; // stays positive after the leak deduction
    Core.budget = startBudget;
    const afterLeak = startBudget - e.leakCost;
    const expectedSteal = Math.round(afterLeak * (CFG.ENEMY_TYPES.competitor.budgetStealPct || 0));
    Core.onEnemyLeaked(e);
    expect(Core.budget).toBe(afterLeak - expectedSteal);
    expect(expectedSteal).toBeGreaterThan(0); // precondition: this test actually exercises the steal
  });

  it('a leaked incident additionally stuns a random teammate', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const e = new Entities.Enemy('incident', PATH.waypoints, 0);
    Core.onEnemyLeaked(e);
    expect(Core.towers[0].stunTimer).toBeGreaterThan(0);
  });

  it('a leaked plain bug has no side effect beyond the direct budget loss', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    Core.onEnemyLeaked(e);
    expect(Core.towers[0].stunTimer).toBe(0);
  });
});

describe('Core.stunRandomTeammate', () => {
  it('does nothing with no hired teammates', () => {
    expect(() => Core.stunRandomTeammate(1000)).not.toThrow();
  });

  it('sets stunTimer to (at least) the given duration', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.stunRandomTeammate(3000);
    expect(Core.towers[0].stunTimer).toBe(3000);
  });

  it('never shortens an already-longer stun', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.towers[0].stunTimer = 5000;
    Core.stunRandomTeammate(1000);
    expect(Core.towers[0].stunTimer).toBe(5000);
  });
});

describe('Core.applyStageTransition', () => {
  it('injects the stage budget and tracks it as income when positive', () => {
    const before = Core.budget;
    const stage = { name: 'Seed', budgetInjection: 15000, key: 'seed' };
    Core.applyStageTransition(stage);
    expect(Core.budget).toBe(before + 15000);
    expect(Core.stats.income).toBe(15000);
  });

  it('a zero injection (Pre-Seed) leaves budget/income untouched', () => {
    const before = Core.budget;
    Core.applyStageTransition({ name: 'Pre-Seed', budgetInjection: 0, key: 'preseed' });
    expect(Core.budget).toBe(before);
    expect(Core.stats.income).toBe(0);
  });
});

describe('Core.applyScaleUpMilestone', () => {
  it('injects an amount that grows with the loop index', () => {
    const before = Core.budget;
    Core.applyScaleUpMilestone(2);
    const expected = Math.round(CFG.SCALEUP_INJECTION_BASE + CFG.SCALEUP_INJECTION_GROWTH * 1);
    expect(Core.budget).toBe(before + expected);
    expect(Core.stats.income).toBe(expected);
  });
});

describe('Core.roleUnlocked', () => {
  it('every role is unlocked with no unlockRequiresStage set (current config has none gated)', () => {
    for (const type of Object.keys(CFG.TOWER_TYPES)) {
      expect(Core.roleUnlocked(type)).toBe(true);
    }
  });
});

describe('negative-budget grace period (Core.update)', () => {
  it('does not end the game the instant budget dips below zero', () => {
    Core.budget = -1;
    Core.update(0.016);
    expect(Core.state).not.toBe('gameover');
    expect(Core.negativeBudgetTimer).toBeGreaterThan(0);
  });

  it('counts the grace timer down while budget stays negative', () => {
    Core.budget = -1;
    Core.update(0.016);
    const first = Core.negativeBudgetTimer;
    Core.update(1);
    expect(Core.negativeBudgetTimer).toBeCloseTo(first - 1, 5);
  });

  it('ends the game once the grace period fully elapses', () => {
    Core.budget = -1;
    Core.update(0.016); // starts the grace timer
    Core.update(CFG.NEGATIVE_BUDGET_GRACE + 1); // blow straight through it
    expect(Core.state).toBe('gameover');
  });

  it('clears the grace timer once budget recovers back to zero or above', () => {
    Core.budget = -1;
    Core.update(0.016);
    Core.budget = 100;
    Core.update(0.016);
    expect(Core.negativeBudgetTimer).toBe(0);
    expect(Core.state).not.toBe('gameover');
  });
});

describe('Core.update kill/leak bookkeeping', () => {
  it('awards bounty, increments the kill stat, and removes a dead enemy from play', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.hp = 0; e.dead = true;
    Core.enemies.push(e);
    const budgetBefore = Core.budget;
    Core.update(0.016);
    expect(Core.budget).toBe(budgetBefore + e.bounty);
    expect(Core.stats.kills).toBe(1);
    expect(Core.enemies).not.toContain(e);
  });

  it('a leaked enemy (reachedEnd) is charged and removed, with no bounty awarded', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.wpIndex = e.waypoints.length - 1; // update() will flip reachedEnd immediately
    Core.enemies.push(e);
    const budgetBefore = Core.budget;
    Core.update(0.016);
    expect(Core.budget).toBe(budgetBefore - e.leakCost);
    expect(Core.stats.kills).toBe(0);
    expect(Core.enemies).not.toContain(e);
  });
});

describe('Core.restart', () => {
  it('resets budget, entities, cooldowns, stats, and starts a fresh WaveManager', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.stats.kills = 12;
    Core.negativeBudgetTimer = 5;
    Core.restart();
    expect(Core.budget).toBe(CFG.START_BUDGET);
    expect(Core.towers).toHaveLength(0);
    expect(Core.stats).toEqual({ income: 0, salaries: 0, lost: 0, kills: 0 });
    expect(Core.negativeBudgetTimer).toBe(0);
    expect(Core.waves.waveIndex).toBe(-1);
    expect(Core.state).toBe('playing');
  });
});
