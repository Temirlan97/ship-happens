import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, Camera;

beforeEach(() => {
  Game = loadGame();
  Camera = Game.Camera;
});

describe('Camera.init', () => {
  it('starts zoomed to exactly minZoom (auto-fit) — the core phone-visibility fix', () => {
    Camera.init(390, 844, 1600, 1000);
    expect(Camera.zoom).toBe(Camera.minZoom);
  });

  it('centers the world in the viewport', () => {
    Camera.init(1600, 1000, 1600, 1000);
    const topLeft = Camera.worldToScreen(0, 0);
    const bottomRight = Camera.worldToScreen(1600, 1000);
    const leftGap = topLeft.x;
    const rightGap = 1600 - bottomRight.x;
    expect(leftGap).toBeCloseTo(rightGap, 5);
  });

  it('is width-constrained on a narrow phone viewport (min of the two axis ratios)', () => {
    Camera.init(390, 844, 1600, 1000);
    const widthFit = (390 / 1600) * 0.94;
    expect(Camera.zoom).toBeCloseTo(widthFit, 5);
  });
});

describe('Camera.worldToScreen / screenToWorld', () => {
  it('are exact inverses across a spread of zoom/pan combinations', () => {
    const cases = [
      { zoom: 1, panX: 0, panY: 0 },
      { zoom: 0.5, panX: 100, panY: -40 },
      { zoom: 2.3, panX: -300, panY: 250 },
    ];
    for (const c of cases) {
      Camera.zoom = c.zoom; Camera.panX = c.panX; Camera.panY = c.panY;
      for (const [x, y] of [[0, 0], [800, 500], [1600, 1000], [-50, 3000]]) {
        const screen = Camera.worldToScreen(x, y);
        const world = Camera.screenToWorld(screen.x, screen.y);
        expect(world.x).toBeCloseTo(x, 6);
        expect(world.y).toBeCloseTo(y, 6);
      }
    }
  });
});

describe('Camera.zoomAround', () => {
  beforeEach(() => { Camera.init(1600, 1000, 1600, 1000); });

  it('keeps the world point under the anchor fixed on screen when zooming in', () => {
    const before = Camera.screenToWorld(1000, 400);
    Camera.zoomAround(1.5, 1000, 400);
    const after = Camera.screenToWorld(1000, 400);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('keeps the anchor fixed when zooming out too', () => {
    // Zoom in first via the real API (not a raw assignment) so pan stays
    // internally consistent with the new zoom — a raw `Camera.zoom = 2`
    // would leave panX/panY computed for the OLD zoom, an inconsistent
    // state no real gesture sequence could ever produce.
    Camera.zoomAround(2 / Camera.zoom, 800, 500);
    const before = Camera.screenToWorld(500, 700);
    Camera.zoomAround(0.7, 500, 700);
    const after = Camera.screenToWorld(500, 700);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('clamps to maxZoom, and the anchor math still holds at the clamped value', () => {
    Camera.zoomAround(1000, 1000, 400); // absurd factor, way past maxZoom
    expect(Camera.zoom).toBe(Camera.maxZoom);
    const before = Camera.screenToWorld(1000, 400);
    Camera.zoomAround(1000, 1000, 400); // already at max — anchor math must still be self-consistent
    expect(Camera.zoom).toBe(Camera.maxZoom);
    const after = Camera.screenToWorld(1000, 400);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('clamps to minZoom (cannot zoom out past "whole board fits")', () => {
    Camera.zoomAround(0.0001, 1000, 400);
    expect(Camera.zoom).toBe(Camera.minZoom);
  });
});

describe('Camera.panBy clamping', () => {
  it('is a no-op at minZoom — the board already exactly fills/under-fills the viewport, centered', () => {
    Camera.init(1600, 1000, 1600, 1000); // zoom starts at minZoom
    const before = { panX: Camera.panX, panY: Camera.panY };
    Camera.panBy(500, 500);
    expect(Camera.panX).toBe(before.panX);
    expect(Camera.panY).toBe(before.panY);
  });

  it('stops exactly at the world edge when panning past it at a higher zoom', () => {
    Camera.init(1600, 1000, 1600, 1000);
    Camera.zoom = Camera.maxZoom;
    Camera.panX = 0; Camera.panY = 0;
    Camera.panBy(100000, 100000); // way past any real edge
    // Panning right/down reveals the world's own top-left edge — panX/panY
    // can never exceed 0 (that would show empty space left of/above x=0).
    expect(Camera.panX).toBe(0);
    expect(Camera.panY).toBe(0);

    const minPanX = Camera.viewportW - Camera.worldW * Camera.zoom;
    const minPanY = Camera.viewportH - Camera.worldH * Camera.zoom;
    Camera.panBy(-1000000, -1000000); // way past the opposite edge
    expect(Camera.panX).toBe(minPanX);
    expect(Camera.panY).toBe(minPanY);
  });
});

describe('Camera.onResize', () => {
  it('re-clamps zoom into the new bounds if the new viewport is smaller', () => {
    Camera.init(1600, 1000, 1600, 1000);
    Camera.zoom = Camera.maxZoom;
    Camera.onResize(390, 844);
    expect(Camera.zoom).toBeLessThanOrEqual(Camera.maxZoom);
    expect(Camera.zoom).toBeGreaterThanOrEqual(Camera.minZoom);
  });

  it('does not reset a manually-changed zoom back to auto-fit', () => {
    Camera.init(1600, 1000, 1600, 1000);
    const manualZoom = (Camera.minZoom + Camera.maxZoom) / 2;
    Camera.zoom = manualZoom;
    Camera.onResize(1600, 1000); // same viewport, nothing forcing a re-fit
    expect(Camera.zoom).toBe(manualZoom);
  });

  it('re-clamps pan to stay valid after the viewport changes', () => {
    Camera.init(1600, 1000, 1600, 1000);
    Camera.zoom = Camera.maxZoom;
    Camera.panX = 0; Camera.panY = 0; // pinned at the top-left edge
    Camera.onResize(390, 844); // much smaller viewport — old pan may now be invalid
    const minPanX = Camera.viewportW - Camera.worldW * Camera.zoom;
    expect(Camera.panX).toBeLessThanOrEqual(0);
    expect(Camera.panX).toBeGreaterThanOrEqual(minPanX);
  });
});
