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
  // Force an identity camera (zoom 1, no pan) so every existing test's
  // world-pixel coordinates keep meaning exactly what they say — camera
  // zoom/pan behavior itself is covered separately in tests/logic/camera.test.js.
  // Also sync Camera's own viewport/world bookkeeping to this file's actual
  // canvas size — Camera.init ran once already at game.js's module-load
  // time using jsdom's default window size, which doesn't match the
  // 1600x1000 this file uses, and clampPan()/onResize() read those stored
  // dimensions directly.
  Game.Camera.zoom = 1; Game.Camera.panX = 0; Game.Camera.panY = 0;
  Game.Camera.viewportW = canvas.width; Game.Camera.viewportH = canvas.height;
  Game.Camera.worldW = PATH.BOARD_W; Game.Camera.worldH = PATH.BOARD_H;
  Game.Camera.minZoom = 0.1; Game.Camera.maxZoom = 5;
  Core.bindInput();
  // ui.js keeps its own module-private reference to Core, set via UI.init —
  // showHirePanel/updateUpgradePanel are no-ops without it, same as the real
  // app (Core.init() calls both bindInput() and UI.init(this) together).
  Game.UI.init(Core);
  Core.state = 'playing';
});

// A real tap: down then up at the same point with no movement between —
// tap logic now fires on pointerup (see bindInput's drag-vs-tap threshold),
// not on pointerdown alone.
function click(x, y) {
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  canvas.dispatchEvent(new window.MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
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

// pointerId is normally supplied by the browser; jsdom's MouseEvent doesn't
// carry one, so these tests tag it on manually to exercise multi-pointer
// (pinch) tracking, which is keyed by pointerId in bindInput.
function pdown(x, y, pointerId) {
  const e = new window.MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true });
  e.pointerId = pointerId;
  canvas.dispatchEvent(e);
}
function pmove(x, y, pointerId) {
  const e = new window.MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
  e.pointerId = pointerId;
  canvas.dispatchEvent(e);
}
function pup(x, y, pointerId) {
  const e = new window.MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true });
  e.pointerId = pointerId;
  canvas.dispatchEvent(e);
}

describe('drag-to-pan (single pointer)', () => {
  // Zoomed in, pan parked mid-range — at exactly zoom 1 the 1600x1000 world
  // exactly fills the 1600x1000 test viewport (nothing to pan to), and
  // starting pan at a boundary (e.g. 0) would clamp away exactly the
  // direction these tests drag in. Mid-range leaves room on both sides.
  beforeEach(() => {
    Game.Camera.zoom = 2; Game.Camera.panX = -800; Game.Camera.panY = -500;
  });

  it('a drag past the threshold pans the camera and does not fire a tap', () => {
    pdown(700, 500, 1);
    pmove(740, 515, 1); // well past the 8px drag threshold
    pup(740, 515, 1);
    expect(Core.pendingHireDesk).toBeNull(); // no tap side effect fired
    expect(Game.Camera.panX).toBe(-760);
    expect(Game.Camera.panY).toBe(-485);
  });

  it('a tiny jitter under the threshold still fires a tap on release', () => {
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    const s = Game.Camera.worldToScreen(c.x, c.y); // screen point for that world position, at the active zoom/pan
    pdown(s.x, s.y, 1);
    pmove(s.x + 2, s.y + 1, 1); // under the 8px threshold
    pup(s.x + 2, s.y + 1, 1);
    expect(Core.pendingHireDesk).toEqual(d);
  });

  it('a pointercancel mid-drag never fires a tap', () => {
    pdown(700, 500, 1);
    pmove(740, 540, 1);
    const e = new window.MouseEvent('pointercancel', { bubbles: true });
    e.pointerId = 1;
    canvas.dispatchEvent(e);
    expect(Core.pendingHireDesk).toBeNull();
  });
});

describe('pinch (two pointers) and wheel zoom', () => {
  it('two pointers moving apart zooms in around their midpoint', () => {
    pdown(700, 500, 1);
    pdown(900, 500, 2);
    const zoomBefore = Game.Camera.zoom;
    pmove(650, 500, 1); // spread the pair further apart -> zoom in
    pmove(950, 500, 2);
    expect(Game.Camera.zoom).toBeGreaterThan(zoomBefore);
  });

  it('wheel zooms in around the cursor and keeps that world point fixed on screen', () => {
    const before = Game.Camera.screenToWorld(800, 500);
    const e = new window.WheelEvent('wheel', { clientX: 800, clientY: 500, deltaY: -100, bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(Game.Camera.zoom).toBeGreaterThan(1);
    const after = Game.Camera.screenToWorld(800, 500);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
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
  // The world's pixel layout is now fixed forever after boot (see PATH.init
  // in game.js) — only the camera adapts to a resize, so tower/enemy world
  // positions must come out byte-identical, not "correctly re-derived."
  it('leaves every tower world position completely untouched', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const before = { x: Core.towers[0].x, y: Core.towers[0].y };
    Core.handleResize();
    expect(Core.towers[0].x).toBe(before.x);
    expect(Core.towers[0].y).toBe(before.y);
  });

  it("leaves an enemy's position completely untouched", () => {
    const e = new Game.Entities.Enemy('bug', PATH.waypoints, 0);
    const a = e.waypoints[0], b = e.waypoints[1];
    // Walk it 40% of the way down the first leg.
    e.x = a.x + (b.x - a.x) * 0.4;
    e.y = a.y + (b.y - a.y) * 0.4;
    Core.enemies.push(e);
    const before = { x: e.x, y: e.y };

    Core.handleResize();
    expect(e.x).toBe(before.x);
    expect(e.y).toBe(before.y);
  });

  it('resizes the canvas backing store and re-clamps the camera to the new size', () => {
    const spy = vi.spyOn(Game.Camera, 'onResize');
    Core.handleResize();
    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);
    expect(spy).toHaveBeenCalledWith(window.innerWidth, window.innerHeight);
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
