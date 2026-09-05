// bindInput()'s handler bodies only run once a real DOM event is dispatched
// on the canvas/window/document — registering the listener alone (as every
// other test implicitly does via loadGame) never executes them. These tests
// dispatch real events to exercise that logic for real.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core, canvas;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  PATH = Game.Path;
  Core = Game.Core;
  canvas = document.getElementById('gameCanvas');
  canvas.width = 1600;
  canvas.height = 1000;
  // jsdom lays out nothing by default, so getBoundingClientRect() would
  // otherwise return an all-zero rect — dividing by a zero width/height in
  // bindInput's toCanvasXY would turn every click coordinate into NaN.
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height });
  PATH.relayout(canvas.width, canvas.height);
  Core.bindInput();
  // ui.js keeps its own module-private reference to Core, set via UI.init —
  // showHirePanel/updateUpgradePanel are no-ops without it, same as the real
  // app (Core.init() calls both bindInput() and UI.init(this) together).
  Game.UI.init(Core);
  Core.state = 'playing';
});

function click(x, y) {
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
}
function move(x, y) {
  canvas.dispatchEvent(new window.MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
}

describe('pointerdown routing', () => {
  it('ignores input while not in the playing state', () => {
    Core.state = 'paused';
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    click(c.x, c.y);
    expect(Core.pendingHireDesk).toBeNull();
  });

  it('clicking an empty desk opens the hire panel for it', () => {
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    click(c.x, c.y);
    expect(Core.pendingHireDesk).toEqual(d);
    expect(document.getElementById('hirePanel').classList.contains('hidden')).toBe(false);
  });

  it('clicking the empty coffee spot hires it directly (no panel)', () => {
    Core.budget = CFG.TOWER_TYPES.coffee.cost;
    const cs = CFG.COFFEE_SPOT;
    const c = PATH.cellCenter(cs.col, cs.row);
    click(c.x, c.y);
    expect(Core.towers).toHaveLength(1);
    expect(Core.towers[0].type).toBe('coffee');
  });

  it('clicking a hired tower selects it (opens the upgrade panel)', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const c = PATH.cellCenter(d.col, d.row);
    click(c.x, c.y);
    expect(Core.selectedTower).toBe(Core.towers[0]);
  });

  it('clicking empty ground deselects everything', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    const c = PATH.cellCenter(6, 0); // plain empty cell
    click(c.x, c.y);
    expect(Core.selectedTower).toBeNull();
  });
});

describe('pointermove / pointerleave (hover + cursor)', () => {
  it('sets the cursor to pointer and hoverTarget when over an empty desk', () => {
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    move(c.x, c.y);
    expect(canvas.style.cursor).toBe('pointer');
    expect(Core.hoverTarget).toEqual({ type: 'desk', desk: d });
  });

  it('sets the cursor to default over empty ground', () => {
    const c = PATH.cellCenter(6, 0);
    move(c.x, c.y);
    expect(canvas.style.cursor).toBe('default');
    expect(Core.hoverTarget).toBeNull();
  });

  it('pointerleave clears the hover state and resets the cursor', () => {
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    move(c.x, c.y);
    canvas.dispatchEvent(new window.Event('pointerleave', { bubbles: true }));
    expect(Core.hoverTarget).toBeNull();
    expect(canvas.style.cursor).toBe('default');
  });

  it('ignores pointermove while not playing (clears hover, defaults cursor)', () => {
    move(100, 100); // establish some hover state first
    Core.state = 'paused';
    move(200, 200);
    expect(Core.hoverTarget).toBeNull();
    expect(canvas.style.cursor).toBe('default');
  });
});

describe('keydown Escape', () => {
  it('closes the upgrade and hire panels', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Game.UI.updateUpgradePanel();
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(Core.selectedTower).toBeNull();
    expect(Core.pendingHireDesk).toBeNull();
  });
});

describe('visibilitychange auto-pause', () => {
  it('pauses when the tab becomes hidden while playing', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    expect(Core.state).toBe('paused');
    expect(Core.autoPausedByVisibility).toBe(true);
  });

  it('shows a toast when the tab becomes visible again after an auto-pause', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    expect(() => document.dispatchEvent(new window.Event('visibilitychange'))).not.toThrow();
    expect(Core.autoPausedByVisibility).toBe(false);
  });
});

describe('window resize (debounced)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('calls handleResize after the debounce delay, not immediately', () => {
    const spy = vi.spyOn(Core, 'handleResize');
    window.dispatchEvent(new window.Event('resize'));
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid repeated resizes into a single call', () => {
    const spy = vi.spyOn(Core, 'handleResize');
    window.dispatchEvent(new window.Event('resize'));
    vi.advanceTimersByTime(50);
    window.dispatchEvent(new window.Event('resize'));
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Core.handleResize', () => {
  it('re-derives every tower position exactly from its stored col/row', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.handleResize();
    const expected = PATH.cellCenter(d.col, d.row);
    expect(Core.towers[0].x).toBe(expected.x);
    expect(Core.towers[0].y).toBe(expected.y);
  });

  it("preserves an enemy's fractional progress along its current leg instead of resetting to the leg's start", () => {
    const e = new Game.Entities.Enemy('bug', PATH.waypoints, 0);
    const a = e.waypoints[0], b = e.waypoints[1];
    // Walk it 40% of the way down the first leg.
    e.x = a.x + (b.x - a.x) * 0.4;
    e.y = a.y + (b.y - a.y) * 0.4;
    Core.enemies.push(e);

    Core.handleResize(); // viewport size unchanged here, but the same code path runs
    const newA = e.waypoints[0], newB = e.waypoints[1];
    const legDist = Math.hypot(newB.x - newA.x, newB.y - newA.y);
    const travelled = Math.hypot(e.x - newA.x, e.y - newA.y);
    expect(travelled / legDist).toBeCloseTo(0.4, 5);
  });

  it('closes any open desk/upgrade popup since its on-screen anchor just moved', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.pendingHireDesk = d;
    Game.UI.showHirePanel(d);
    Core.handleResize();
    expect(Core.pendingHireDesk).toBeNull();
    expect(document.getElementById('hirePanel').classList.contains('hidden')).toBe(true);
  });
});

describe('misc small Core methods not otherwise exercised', () => {
  it('cycleSpeed cycles 1x -> 2x -> 3x -> 1x', () => {
    expect(Core.speed).toBe(1);
    Core.cycleSpeed(); expect(Core.speed).toBe(2);
    Core.cycleSpeed(); expect(Core.speed).toBe(3);
    Core.cycleSpeed(); expect(Core.speed).toBe(1);
  });

  it('spawnRing/shake push expected state', () => {
    Core.spawnRing(1, 2, 30, '#fff');
    expect(Core.effects.at(-1)).toMatchObject({ type: 'ring', x: 1, y: 2, maxRadius: 30 });
    Core.shake(0.5);
    expect(Core.shakeTimer).toBe(0.5);
    Core.shake(0.1); // shorter shake never shortens an existing longer one
    expect(Core.shakeTimer).toBe(0.5);
  });

  it('spawnEnemy adds a new enemy sharing the live waypoints reference', () => {
    Core.spawnEnemy('bug', 0);
    expect(Core.enemies).toHaveLength(1);
    expect(Core.enemies[0].waypoints).toBe(PATH.waypoints);
  });

  it('requestNextWave defers to WaveManager, refusing while already active', () => {
    Core.requestNextWave();
    expect(Core.waves.active).toBe(true);
    const waveIndexBefore = Core.waves.waveIndex;
    Core.requestNextWave();
    expect(Core.waves.waveIndex).toBe(waveIndexBefore);
  });

  it('togglePause / toggleMute flip their respective state', () => {
    Core.state = 'playing';
    Core.togglePause();
    expect(Core.state).toBe('paused');
    Core.togglePause();
    expect(Core.state).toBe('playing');
    Core.toggleMute();
    expect(Core.muted).toBe(true);
  });

  it('gameOver records the reached sprint and persists a new best', () => {
    Core.waves.waveIndex = 4; // displayWaveNumber = 5
    Core.bestSprint = 2;
    Core.gameOver();
    expect(Core.state).toBe('gameover');
    expect(Core.lastReachedSprint).toBe(5);
    expect(Core.bestSprint).toBe(5);
  });
});
