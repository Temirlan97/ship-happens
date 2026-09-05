import { describe, it, expect } from 'vitest';
import { loadGame } from './helpers/loadGame.js';

describe('loadGame helper', () => {
  it('loads every real game script in dependency order with no throw', () => {
    const Game = loadGame();
    expect(Game.Config).toBeTruthy();
    expect(Game.Assets).toBeTruthy();
    expect(Game.Audio).toBeTruthy();
    expect(Game.Path).toBeTruthy();
    expect(Game.Entities).toBeTruthy();
    expect(Game.Waves).toBeTruthy();
    expect(Game.Core).toBeTruthy();
    expect(Game.UI).toBeTruthy();
  });

  it('gives a fresh window.Game on each call (no state leaking between tests)', () => {
    const Game1 = loadGame();
    Game1.Core.budget = -99999;
    const Game2 = loadGame();
    expect(Game2.Core.budget).not.toBe(-99999);
  });
});
