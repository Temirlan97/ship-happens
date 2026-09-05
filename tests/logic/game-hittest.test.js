import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  PATH = Game.Path;
  Core = Game.Core;
  PATH.relayout(1600, 1000);
});

describe('Core.hitTest', () => {
  it('returns null over an empty cell with nothing nearby', () => {
    const c = PATH.cellCenter(6, 0); // not a desk, not the coffee spot
    expect(Core.hitTest(c.x, c.y)).toBeNull();
  });

  it("returns the desk when clicking an empty desk's cell", () => {
    const d = CFG.DESK_POSITIONS[0];
    const c = PATH.cellCenter(d.col, d.row);
    const hit = Core.hitTest(c.x, c.y);
    expect(hit).toEqual({ type: 'desk', desk: d });
  });

  it('returns coffee when clicking the empty coffee spot', () => {
    const cs = CFG.COFFEE_SPOT;
    const c = PATH.cellCenter(cs.col, cs.row);
    expect(Core.hitTest(c.x, c.y)).toEqual({ type: 'coffee' });
  });

  it("returns the tower when clicking within its 26px hit radius", () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    const hit = Core.hitTest(tower.x + 10, tower.y);
    expect(hit).toEqual({ type: 'tower', tower });
  });

  it('falls back to desk-cell occupancy for a click outside the 26px radius but still on the same cell', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    // Find an offset that's outside the 26px radius but still resolves to
    // the tower's own cell via screenToCell — verified as a precondition
    // rather than hand-derived, so this stays correct if geometry changes.
    const x = tower.x, y = tower.y + 27;
    const dist = Math.hypot(x - tower.x, y - tower.y);
    expect(dist).toBeGreaterThan(26);
    const cellAtOffset = PATH.screenToCell(x, y);
    expect(cellAtOffset).toEqual({ col: d.col, row: d.row }); // precondition for this test to mean anything
    expect(Core.hitTest(x, y)).toEqual({ type: 'tower', tower });
  });

  it('an occupied desk takes precedence over the generic desk-hire result', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const c = PATH.cellCenter(d.col, d.row);
    const hit = Core.hitTest(c.x, c.y);
    expect(hit.type).toBe('tower');
  });

  it('an occupied coffee spot takes precedence over the "coffee" hire result', () => {
    const cs = CFG.COFFEE_SPOT;
    Core.budget = CFG.TOWER_TYPES.coffee.cost; // deliberately very expensive by design — cover the cost
    Core.hireAt(cs.col, cs.row, 'coffee');
    expect(Core.towers).toHaveLength(1); // precondition: the hire actually went through
    const c = PATH.cellCenter(cs.col, cs.row);
    expect(Core.hitTest(c.x, c.y).type).toBe('tower');
  });
});

describe('Core.towerAt', () => {
  it('finds a hired tower by its col/row', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    expect(Core.towerAt(d.col, d.row)).toBe(Core.towers[0]);
  });

  it('returns null for an empty cell', () => {
    expect(Core.towerAt(0, 0)).toBeNull();
  });
});

describe('Core.getCardState', () => {
  it('is affordable and unlocked with a fresh budget and no cooldown', () => {
    const s = Core.getCardState('engineer');
    expect(s.locked).toBe(false);
    expect(s.affordable).toBe(true);
    expect(s.cost).toBe(CFG.TOWER_TYPES.engineer.cost);
  });

  it('is unaffordable once budget drops below cost', () => {
    Core.budget = 1;
    expect(Core.getCardState('engineer').affordable).toBe(false);
  });

  it('is locked (cooldownFraction > 0) right after a hire, until the cooldown elapses', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const s = Core.getCardState('engineer');
    expect(s.locked).toBe(true);
    expect(s.cooldownFraction).toBe(1);
  });
});

describe('Core.hireAt', () => {
  it('places a tower, deducts its cost, and starts its purchase cooldown', () => {
    const d = CFG.DESK_POSITIONS[0];
    const budgetBefore = Core.budget;
    Core.hireAt(d.col, d.row, 'engineer');
    expect(Core.towers).toHaveLength(1);
    expect(Core.towers[0].col).toBe(d.col);
    expect(Core.towers[0].row).toBe(d.row);
    expect(Core.budget).toBe(budgetBefore - CFG.TOWER_TYPES.engineer.cost);
    expect(Core.cardCooldowns.engineer).toBe(CFG.TOWER_TYPES.engineer.cooldown);
  });

  it('refuses to hire onto an already-occupied desk (prevents the stacking bug)', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.hireAt(d.col, d.row, 'pm');
    expect(Core.towers).toHaveLength(1);
    expect(Core.towers[0].type).toBe('engineer');
  });

  it('refuses to hire when unaffordable', () => {
    Core.budget = 0;
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    expect(Core.towers).toHaveLength(0);
  });

  it('refuses to hire while the role is on cooldown', () => {
    const d0 = CFG.DESK_POSITIONS[0];
    const d1 = CFG.DESK_POSITIONS[1];
    Core.hireAt(d0.col, d0.row, 'engineer');
    Core.hireAt(d1.col, d1.row, 'engineer'); // still on cooldown from the first hire
    expect(Core.towers).toHaveLength(1);
  });
});

describe('Core.upgradeSelected', () => {
  it('upgrades the selected tower and deducts its upgrade cost', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    Core.selectedTower = tower;
    const cost = tower.upgradeCost();
    const budgetBefore = Core.budget;
    Core.upgradeSelected();
    expect(tower.level).toBe(2);
    expect(Core.budget).toBe(budgetBefore - cost);
  });

  it('does nothing when unaffordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    Core.selectedTower = tower;
    Core.budget = 0;
    Core.upgradeSelected();
    expect(tower.level).toBe(1);
  });

  it('does nothing when no tower is selected', () => {
    Core.selectedTower = null;
    expect(() => Core.upgradeSelected()).not.toThrow();
  });
});

describe('Core.severanceCostFor', () => {
  it('is SEVERANCE_SALARY_MULT times the tower\'s current (rank-scaled) salary', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    expect(Core.severanceCostFor(tower)).toBe(Math.round(tower.salary * CFG.SEVERANCE_SALARY_MULT));
  });

  it('scales up as the tower is promoted, since salary itself scales with rank', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    const level1Severance = Core.severanceCostFor(tower);
    tower.level = 4;
    expect(Core.severanceCostFor(tower)).toBeGreaterThan(level1Severance);
  });
});

describe('Core.fireSelectedTower', () => {
  it('removes the tower, deducts severance from budget, and frees the desk', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const tower = Core.towers[0];
    Core.selectedTower = tower;
    const severance = Core.severanceCostFor(tower);
    const budgetBefore = Core.budget;
    Core.fireSelectedTower();
    expect(Core.towers).toHaveLength(0);
    expect(Core.budget).toBe(budgetBefore - severance);
    expect(Core.towerAt(d.col, d.row)).toBeNull();
  });

  it('tracks severance paid under the same cumulative stat as salaries', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    const severance = Core.severanceCostFor(Core.towers[0]);
    Core.fireSelectedTower();
    expect(Core.stats.salaries).toBe(severance);
  });

  it('deselects the tower after firing (closes the upgrade panel)', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.fireSelectedTower();
    expect(Core.selectedTower).toBeNull();
  });

  it('refuses to fire (and leaves the tower in place) when severance is unaffordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 0;
    Core.fireSelectedTower();
    expect(Core.towers).toHaveLength(1);
    expect(Core.selectedTower).toBe(Core.towers[0]);
  });

  it('does nothing when no tower is selected', () => {
    Core.selectedTower = null;
    expect(() => Core.fireSelectedTower()).not.toThrow();
  });

  it('a freed desk can immediately be hired onto again', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.budget = 999999;
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.fireSelectedTower();
    Core.hireAt(d.col, d.row, 'pm');
    expect(Core.towers).toHaveLength(1);
    expect(Core.towers[0].type).toBe('pm');
  });
});
