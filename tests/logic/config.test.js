import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let CFG;
let fmt;

beforeEach(() => {
  const Game = loadGame(['config.js']);
  CFG = Game.Config;
  fmt = Game.fmt;
});

describe('Config shape', () => {
  it('defines the board dimensions', () => {
    expect(CFG.COLS).toBe(16);
    expect(CFG.ROWS).toBe(10);
    expect(CFG.CELL).toBeGreaterThan(0);
  });

  it('gives every tower type the fields shared by all towers', () => {
    for (const [key, def] of Object.entries(CFG.TOWER_TYPES)) {
      expect(def.name, key).toBeTruthy();
      expect(def.cost, key).toBeGreaterThan(0);
      expect(def.cooldown, key).toBeGreaterThan(0);
      expect(def.salaryBase, key).toBeGreaterThan(0);
      expect(def.ranks, key).toHaveLength(4);
    }
  });

  it('gives combat towers (engineer/sre/qa) range+fireRate+damage', () => {
    for (const key of ['engineer', 'sre', 'qa']) {
      const def = CFG.TOWER_TYPES[key];
      expect(def.range, key).toBeGreaterThan(0);
      expect(def.fireRate, key).toBeGreaterThan(0);
      expect(def.damage, key).toBeGreaterThan(0);
    }
  });

  it('gives the PM income + interval instead of combat stats', () => {
    const pm = CFG.TOWER_TYPES.pm;
    expect(pm.income).toBeGreaterThan(0);
    expect(pm.interval).toBeGreaterThan(0);
  });

  it('gives the coffee machine an aura attack with dmg/rate multipliers', () => {
    const coffee = CFG.TOWER_TYPES.coffee;
    expect(coffee.attack).toBe('aura');
    expect(coffee.auraDmgMult).toBeGreaterThan(0);
    expect(coffee.auraRateMult).toBeGreaterThan(0);
  });

  it('gives every enemy type hp/speed/leakCost/bounty/radius', () => {
    for (const [key, def] of Object.entries(CFG.ENEMY_TYPES)) {
      expect(def.hp, key).toBeGreaterThan(0);
      expect(def.speed, key).toBeGreaterThan(0);
      expect(def.leakCost, key).toBeGreaterThan(0);
      expect(def.bounty, key).toBeGreaterThan(0);
      expect(def.radius, key).toBeGreaterThan(0);
    }
  });

  it('orders funding stages by ascending triggerSprint, ending in scaleup', () => {
    const sprints = CFG.FUNDING_STAGES.map(s => s.triggerSprint);
    const sorted = [...sprints].sort((a, b) => a - b);
    expect(sprints).toEqual(sorted);
    expect(CFG.FUNDING_STAGES.at(-1).key).toBe('scaleup');
  });

  it('gives DESK_POSITIONS and COFFEE_SPOT distinct cells inside the board', () => {
    const cs = CFG.COFFEE_SPOT;
    expect(CFG.DESK_POSITIONS.some(d => d.col === cs.col && d.row === cs.row)).toBe(false);
    for (const d of CFG.DESK_POSITIONS) {
      expect(d.col).toBeGreaterThanOrEqual(0);
      expect(d.col).toBeLessThan(CFG.COLS);
      expect(d.row).toBeGreaterThanOrEqual(0);
      expect(d.row).toBeLessThan(CFG.ROWS);
    }
  });
});

describe('window.Game.fmt', () => {
  it('formats a positive amount with a $ prefix and thousands separators', () => {
    expect(fmt(1234567)).toBe('$1,234,567');
  });

  it('formats a negative amount with a -$ prefix on the absolute value', () => {
    expect(fmt(-500)).toBe('-$500');
  });

  it('formats zero as $0', () => {
    expect(fmt(0)).toBe('$0');
  });

  it('rounds fractional amounts to the nearest whole dollar', () => {
    expect(fmt(12.6)).toBe('$13');
    expect(fmt(12.4)).toBe('$12');
    expect(fmt(-12.6)).toBe('-$13');
  });
});
