import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let PATH;

beforeEach(() => {
  const Game = loadGame(['config.js', 'assets.js', 'path.js']);
  PATH = Game.Path;
  PATH.init(1600, 1000);
});

describe('PATH.cellCenter / screenToCell', () => {
  it('round-trips every playable cell exactly', () => {
    for (let col = 0; col < 16; col++) {
      for (let row = 0; row < 10; row++) {
        const c = PATH.cellCenter(col, row);
        expect(PATH.screenToCell(c.x, c.y)).toEqual({ col, row });
      }
    }
  });

  it('moves diagonally down-right on screen as col increases (isometric x/y both grow)', () => {
    const a = PATH.cellCenter(3, 3);
    const b = PATH.cellCenter(4, 3);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe('PATH.isBuildable', () => {
  it('is false for cells on the enemy path', () => {
    expect(PATH.isBuildable(5, 1)).toBe(false); // top horizontal run
    expect(PATH.isBuildable(13, 3)).toBe(false); // right vertical run
  });

  it('is true for a plain off-path cell', () => {
    expect(PATH.isBuildable(0, 0)).toBe(true);
  });

  it('is false outside the board bounds', () => {
    expect(PATH.isBuildable(-1, 0)).toBe(false);
    expect(PATH.isBuildable(0, -1)).toBe(false);
    expect(PATH.isBuildable(16, 0)).toBe(false);
    expect(PATH.isBuildable(0, 10)).toBe(false);
  });
});

describe('path run/corner classification (drives which way carpet art mirrors)', () => {
  // The path is: row1 cols0-13 (horizontal) -> col13 rows1-4 (vertical) ->
  // row4 cols2-13 (horizontal) -> col2 rows4-8 (vertical) -> row8 cols2-15
  // (horizontal). Corners are the 4 cells where a horizontal and a vertical
  // run share a cell.
  it('turn corner (13,1) is part of both a horizontal and a vertical run', () => {
    const blocked = window.Game.Path.blocked;
    const horiz = blocked.has('12,1') || blocked.has('14,1');
    const vert = blocked.has('13,0') || blocked.has('13,2');
    expect(horiz).toBe(true);
    expect(vert).toBe(true);
  });

  it('straight run cell (5,1) is horizontal-only', () => {
    const blocked = window.Game.Path.blocked;
    const horiz = blocked.has('4,1') || blocked.has('6,1');
    const vert = blocked.has('5,0') || blocked.has('5,2');
    expect(horiz).toBe(true);
    expect(vert).toBe(false);
  });

  it('straight run cell (13,2) is vertical-only', () => {
    const blocked = window.Game.Path.blocked;
    const horiz = blocked.has('12,2') || blocked.has('14,2');
    const vert = blocked.has('13,1') || blocked.has('13,3');
    expect(horiz).toBe(false);
    expect(vert).toBe(true);
  });
});

describe('PATH.relayout', () => {
  it('keeps the same waypoints array reference across relayouts (Enemy instances hold this reference)', () => {
    const ref = PATH.waypoints;
    PATH.relayout(1200, 800);
    expect(PATH.waypoints).toBe(ref);
  });

  it('always produces exactly 6 waypoints: Backlog, 3 turns, and the Product', () => {
    PATH.relayout(1200, 800);
    expect(PATH.waypoints).toHaveLength(6);
  });

  it('recenters waypoint positions when the viewport size changes', () => {
    PATH.relayout(1600, 1000);
    const before = { x: PATH.waypoints[0].x, y: PATH.waypoints[0].y };
    PATH.relayout(800, 500);
    const after = { x: PATH.waypoints[0].x, y: PATH.waypoints[0].y };
    expect(after).not.toEqual(before);
  });

  it('the first waypoint is the Backlog spawn cell and the last is the Product cell', () => {
    const first = PATH.cellCenter(0, 1);
    const last = PATH.cellCenter(15, 8);
    expect(PATH.waypoints[0]).toEqual(first);
    expect(PATH.waypoints.at(-1)).toEqual(last);
  });
});
