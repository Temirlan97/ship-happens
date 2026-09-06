import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
});

describe('config shape', () => {
  it('has the four hand-tuned milestones and the continuation/price multipliers', () => {
    expect(CFG.ACQUISITION_MILESTONES).toEqual([3000000, 10000000, 50000000, 100000000]);
    expect(CFG.ACQUISITION_MILESTONE_GROWTH).toBe(5);
    expect(CFG.ACQUISITION_PRICE_MULT).toBe(3);
  });
});

describe('window.Game.acquisitionThresholdFor', () => {
  it('returns the exact hand-tuned values for the first four indices', () => {
    expect(Game.acquisitionThresholdFor(0)).toBe(3000000);
    expect(Game.acquisitionThresholdFor(1)).toBe(10000000);
    expect(Game.acquisitionThresholdFor(2)).toBe(50000000);
    expect(Game.acquisitionThresholdFor(3)).toBe(100000000);
  });

  it('continues geometrically at x5 past the last hand-tuned milestone', () => {
    expect(Game.acquisitionThresholdFor(4)).toBe(500000000);
    expect(Game.acquisitionThresholdFor(5)).toBe(2500000000);
    expect(Game.acquisitionThresholdFor(6)).toBe(12500000000);
  });

  it('is strictly increasing indefinitely', () => {
    let prev = 0;
    for (let i = 0; i < 15; i++) {
      const t = Game.acquisitionThresholdFor(i);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });
});
