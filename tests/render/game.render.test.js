import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';
import { installFakeImage } from '../helpers/fakeImage.js';

let Game, CFG, Core, PATH;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  Core = Game.Core;
  PATH = Game.Path;
  PATH.relayout(1600, 1000);
});

describe('Core.render — empty board', () => {
  it('draws the whole frame (background, desks, towers, enemies, effects) without throwing', () => {
    expect(() => Core.render()).not.toThrow();
  });

  it('draws the paused dim overlay without throwing', () => {
    Core.state = 'paused';
    expect(() => Core.render()).not.toThrow();
  });

  it('draws the screen-shake offset without throwing', () => {
    Core.state = 'playing';
    Core.shakeTimer = 0.2;
    expect(() => Core.render()).not.toThrow();
  });
});

describe('Core.render — populated board', () => {
  it('draws hired towers, a selected-tower ring+range, live enemies, and floating effects without throwing', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.enemies.push(new Game.Entities.Enemy('bug', PATH.waypoints, 0));
    Core.spawnParticles(100, 100, '#fff', 3, 40);
    Core.spawnBigPayday(15000);
    Core.effects.push({ type: 'ring', x: 10, y: 10, maxRadius: 20, life: 0.2, maxLife: 0.35, color: '#fff' });
    Core.effects.push({ type: 'lightning', life: 0.1, maxLife: 0.16, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#fff', glow: '#fff' });
    Core.effects.push({ type: 'flash', x: 10, y: 10, r: 10, life: 0.1, maxLife: 0.18, color: '#fff' });
    Core.effects.push({ type: 'floatText', x: 10, y: 10, life: 0.5, maxLife: 1.1, text: '+$5', color: '#fff' });
    expect(() => Core.render()).not.toThrow();
  });

  it('draws a coffee machine aura glow without throwing', () => {
    Core.budget = 999999;
    Core.hireAt(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, 'coffee');
    expect(() => Core.render()).not.toThrow();
  });

  it('draws the Distribute Bonuses "$" marker over a hired tower without throwing', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.state = 'playing';
    Core.budget = 1000;
    Core.useCeoBonuses();
    expect(() => Core.render()).not.toThrow();
  });

  it('draws the "$" marker for a hired engineer but not for the coffee machine', () => {
    Core.budget = 100000;
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.hireAt(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, 'coffee');
    Core.state = 'playing';
    Core.useCeoBonuses();
    // Call drawBonusMarkers directly (not the full render()) so the count
    // can't be contaminated by the unrelated "$" cashFly effect glyph or
    // any empty-desk "+" badge sharing the same radius-7 circle style.
    const ctx = document.getElementById('gameCanvas').getContext('2d');
    const fillText = vi.spyOn(ctx, 'fillText');
    expect(() => Core.drawBonusMarkers(ctx)).not.toThrow();
    expect(fillText.mock.calls.filter((args) => args[0] === '$')).toHaveLength(1);
  });

  it('draws a coffee-cup marker over a personally-buffed tower without throwing', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.towers[0].coffeeBuffTimer = 5000;
    Core.towers[0].coffeeDmgMult = 1.15;
    Core.towers[0].coffeeRateMult = 0.88;
    expect(() => Core.render()).not.toThrow();
  });

  it('draws an in-flight coffeeFly effect without throwing', () => {
    Core.effects.push({ type: 'coffeeFly', life: 0.3, maxLife: 0.5, x: 100, y: 100, targetX: 300, targetY: 200 });
    expect(() => Core.render()).not.toThrow();
  });

  it('draws the Fix Bugs range-preview ring without throwing', () => {
    Core.ceoRangePreview = true;
    expect(() => Core.render()).not.toThrow();
  });

  it('draws hovered empty desks and coffee spot (highlight branch) without throwing', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hoverTarget = { type: 'desk', desk: d };
    expect(() => Core.render()).not.toThrow();
    Core.hoverTarget = { type: 'coffee' };
    expect(() => Core.render()).not.toThrow();
  });

  it('draws with real desk/coffee sprite art loaded, instead of the procedural fallback', async () => {
    installFakeImage();
    await new Promise((resolve) => Game.Assets.loadAll(resolve));
    expect(() => Core.render()).not.toThrow();
  });
});

describe('Core.loop', () => {
  // Core.loop schedules its own next tick via requestAnimationFrame — left
  // un-stubbed, each call here would kick off a real recursive rAF chain
  // that outlives the test. Stubbing it to a no-op keeps loop()'s own body
  // (update/render/panel-refresh) under test without that side effect.
  beforeEach(() => vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0));

  it('runs one full tick (update + render + panel refresh) without throwing while playing', () => {
    Core.state = 'playing';
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.pendingHireDesk = CFG.DESK_POSITIONS[1];
    expect(() => Core.loop(16)).not.toThrow();
    expect(() => Core.loop(32)).not.toThrow(); // second tick exercises the dt-from-lastTs path
  });

  it('renders without updating game state while paused', () => {
    Core.state = 'paused';
    const budgetBefore = Core.budget;
    Core.loop(16);
    expect(Core.budget).toBe(budgetBefore);
  });
});
