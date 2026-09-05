import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, Entities, PATH;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  Entities = Game.Entities;
  PATH = Game.Path;
  PATH.relayout(1600, 1000);
});

describe('Tower stat getters', () => {
  it('level 1 stats equal the base config values (mult factors are all 1 at level 1)', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const def = CFG.TOWER_TYPES.engineer;
    expect(t.level).toBe(1);
    expect(t.damage).toBe(def.damage);
    expect(t.fireRate).toBe(def.fireRate);
    expect(t.range).toBe(def.range);
    expect(t.rank).toBe(def.ranks[0]);
  });

  it('damage/fireRate/range scale by the level multiplier table', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const def = CFG.TOWER_TYPES.engineer;
    t.level = 3;
    const mult = CFG.UPGRADE_MULT[3];
    expect(t.damage).toBeCloseTo(def.damage * mult.dmg);
    expect(t.fireRate).toBeCloseTo(def.fireRate * mult.rate);
    expect(t.range).toBeCloseTo(def.range * mult.range);
  });

  it('salary scales by SALARY_MULT and rounds to the nearest dollar', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const def = CFG.TOWER_TYPES.engineer;
    for (let level = 1; level <= 4; level++) {
      t.level = level;
      expect(t.salary).toBe(Math.round(def.salaryBase * CFG.SALARY_MULT[level]));
    }
  });

  it('salary grows with Scale-Up tier via SALARY_ENDLESS_GROWTH', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    // Force a Scale-Up tier by advancing the shared Core's wave index directly.
    Game.Core.waves.waveIndex = CFG.CAMPAIGN_SPRINTS + 4; // tier = 5
    const def = CFG.TOWER_TYPES.engineer;
    const expected = Math.round(def.salaryBase * CFG.SALARY_MULT[1] * (1 + 5 * CFG.SALARY_ENDLESS_GROWTH));
    expect(t.salary).toBe(expected);
  });

  it('canUpgrade is true below MAX_TOWER_LEVEL and false at it', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    for (let level = 1; level < CFG.MAX_TOWER_LEVEL; level++) {
      t.level = level;
      expect(t.canUpgrade()).toBe(true);
    }
    t.level = CFG.MAX_TOWER_LEVEL;
    expect(t.canUpgrade()).toBe(false);
  });

  it('upgrade() increments level but refuses past MAX_TOWER_LEVEL', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    t.level = CFG.MAX_TOWER_LEVEL;
    t.upgrade();
    expect(t.level).toBe(CFG.MAX_TOWER_LEVEL);
  });

  it('upgradeCost is round(baseCost * UPGRADE_BASE_COST_FACTOR * (level+1))', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const def = CFG.TOWER_TYPES.engineer;
    expect(t.upgradeCost()).toBe(Math.round(def.cost * CFG.UPGRADE_BASE_COST_FACTOR * 2));
    t.level = 3;
    expect(t.upgradeCost()).toBe(Math.round(def.cost * CFG.UPGRADE_BASE_COST_FACTOR * 4));
  });
});

describe('Coffee Machine aura strength (auraDmgMultValue / auraRateMultValue)', () => {
  it('level 1 matches the base config multipliers', () => {
    const t = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    const def = CFG.TOWER_TYPES.coffee;
    expect(t.auraDmgMultValue).toBeCloseTo(1 + def.auraDmgMult * CFG.AURA_LEVEL_MULT[1]);
    expect(t.auraRateMultValue).toBeCloseTo(Math.max(0.4, 1 - def.auraRateMult * CFG.AURA_LEVEL_MULT[1]));
  });

  it('scales up with level via AURA_LEVEL_MULT, rate multiplier floored at 0.4', () => {
    const t = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    t.level = 4;
    const def = CFG.TOWER_TYPES.coffee;
    const lvlMult = CFG.AURA_LEVEL_MULT[4];
    expect(t.auraDmgMultValue).toBeCloseTo(1 + def.auraDmgMult * lvlMult);
    expect(t.auraRateMultValue).toBeCloseTo(Math.max(0.4, 1 - def.auraRateMult * lvlMult));
  });
});

describe('Core.auraDmgMultFor / auraRateMultFor (company-wide coffee boost)', () => {
  it('is a no-op multiplier (1x) with no coffee machine hired', () => {
    expect(Game.Core.auraDmgMultFor()).toBe(1);
    expect(Game.Core.auraRateMultFor()).toBe(1);
  });

  it('boosts damage and speeds up fire rate once a coffee machine is hired', () => {
    const coffee = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    Game.Core.towers.push(coffee);
    expect(Game.Core.auraDmgMultFor()).toBe(coffee.auraDmgMultValue);
    expect(Game.Core.auraRateMultFor()).toBe(coffee.auraRateMultValue);
  });

  it('a stunned coffee machine contributes no boost', () => {
    const coffee = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    coffee.stunTimer = 5000;
    Game.Core.towers.push(coffee);
    expect(Game.Core.auraDmgMultFor()).toBe(1);
    expect(Game.Core.auraRateMultFor()).toBe(1);
  });

  it('a hired combat tower actually reads the live company-wide boost through its own damage/fireRate getters', () => {
    const coffee = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    const eng = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    Game.Core.towers.push(coffee, eng);
    const def = CFG.TOWER_TYPES.engineer;
    expect(eng.damage).toBeCloseTo(def.damage * coffee.auraDmgMultValue);
    expect(eng.fireRate).toBeCloseTo(def.fireRate * coffee.auraRateMultValue);
  });
});

describe('Tower.findTarget', () => {
  it('picks the enemy furthest along the path (highest wpIndex) within range', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const near = new Entities.Enemy('bug', PATH.waypoints, 0);
    near.x = t.x; near.y = t.y; near.wpIndex = 1;
    const far = new Entities.Enemy('bug', PATH.waypoints, 0);
    far.x = t.x; far.y = t.y; far.wpIndex = 3;
    expect(t.findTarget([near, far])).toBe(far);
  });

  it('ignores enemies outside range', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const outOfRange = new Entities.Enemy('bug', PATH.waypoints, 0);
    outOfRange.x = t.x + t.range + 500;
    outOfRange.y = t.y;
    expect(t.findTarget([outOfRange])).toBeNull();
  });

  it('ignores dead and reachedEnd enemies', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const dead = new Entities.Enemy('bug', PATH.waypoints, 0);
    dead.x = t.x; dead.y = t.y; dead.dead = true;
    const leaked = new Entities.Enemy('bug', PATH.waypoints, 0);
    leaked.x = t.x; leaked.y = t.y; leaked.reachedEnd = true;
    expect(t.findTarget([dead, leaked])).toBeNull();
  });
});

describe('Tower.findChainTarget (QA lightning chain)', () => {
  it('picks the nearest other enemy within chainRange', () => {
    const t = new Entities.Tower('qa', 2, 0, PATH.cellCenter(2, 0));
    const primary = new Entities.Enemy('bug', PATH.waypoints, 0);
    primary.x = 0; primary.y = 0;
    const closer = new Entities.Enemy('bug', PATH.waypoints, 0);
    closer.x = 10; closer.y = 0;
    const farther = new Entities.Enemy('bug', PATH.waypoints, 0);
    farther.x = 50; farther.y = 0;
    expect(t.findChainTarget(primary, [primary, closer, farther])).toBe(closer);
  });

  it('returns null when nothing else is within chainRange', () => {
    const t = new Entities.Tower('qa', 2, 0, PATH.cellCenter(2, 0));
    const primary = new Entities.Enemy('bug', PATH.waypoints, 0);
    primary.x = 0; primary.y = 0;
    const farAway = new Entities.Enemy('bug', PATH.waypoints, 0);
    farAway.x = CFG.TOWER_TYPES.qa.chainRange + 500; farAway.y = 0;
    expect(t.findChainTarget(primary, [primary, farAway])).toBeNull();
  });
});

describe('Enemy stat scaling by Scale-Up tier', () => {
  it('tier 0 uses the base hp/speed with no growth', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    const def = CFG.ENEMY_TYPES.bug;
    expect(e.maxHp).toBe(def.hp);
    expect(e.speed).toBe(def.speed);
  });

  it('a higher tier scales hp by ENDLESS_HP_GROWTH and speed by ENDLESS_SPEED_GROWTH', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 3);
    const def = CFG.ENEMY_TYPES.bug;
    expect(e.maxHp).toBeCloseTo(def.hp * (1 + 3 * CFG.ENDLESS_HP_GROWTH));
    expect(e.speed).toBeCloseTo(def.speed * (1 + 3 * CFG.ENDLESS_SPEED_GROWTH));
  });

  it('starts positioned exactly at the first waypoint', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    expect(e.x).toBe(PATH.waypoints[0].x);
    expect(e.y).toBe(PATH.waypoints[0].y);
  });
});

describe('Enemy.effectiveSpeed / applySlow', () => {
  it('equals full speed with no active slow', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    expect(e.effectiveSpeed).toBe(e.speed);
  });

  it('is reduced by (1 - slowFactor) while a slow is active', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.applySlow(0.4, 1000);
    expect(e.effectiveSpeed).toBeCloseTo(e.speed * 0.6);
  });

  it('a stronger slow overrides a weaker one', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.applySlow(0.2, 1000);
    e.applySlow(0.5, 1000);
    expect(e.slowFactor).toBe(0.5);
  });

  it('a weaker slow while a stronger one is still active does NOT downgrade slowFactor, but still extends the timer', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.applySlow(0.5, 1000);
    e.applySlow(0.2, 3000);
    expect(e.slowFactor).toBe(0.5);
    expect(e.slowTimer).toBeCloseTo(3);
  });
});

describe('Enemy.takeDamage', () => {
  it('reduces hp and sets a brief hit-flash', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.takeDamage(10);
    expect(e.hp).toBe(e.maxHp - 10);
    expect(e.hitFlash).toBeGreaterThan(0);
    expect(e.dead).toBe(false);
  });

  it('marks dead once hp reaches zero or below', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.takeDamage(e.maxHp + 999);
    expect(e.dead).toBe(true);
  });
});

describe('Enemy.update movement', () => {
  it('advances toward the next waypoint without overshooting mid-step', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    const start = { x: e.x, y: e.y };
    const target = e.waypoints[1];
    const fullDist = Math.hypot(target.x - start.x, target.y - start.y);
    const dt = (fullDist / e.speed) * 0.1; // a small step, well short of the waypoint
    e.update(dt);
    const moved = Math.hypot(e.x - start.x, e.y - start.y);
    expect(moved).toBeCloseTo(e.speed * dt, 5);
    expect(e.wpIndex).toBe(0);
    expect(e.reachedEnd).toBe(false);
  });

  it('snaps exactly onto the waypoint and advances wpIndex once it arrives', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    const target = e.waypoints[1];
    const fullDist = Math.hypot(target.x - e.x, target.y - e.y);
    const dt = (fullDist / e.speed) * 1.5; // overshoots this leg
    e.update(dt);
    expect(e.x).toBe(target.x);
    expect(e.y).toBe(target.y);
    expect(e.wpIndex).toBe(1);
  });

  it('sets reachedEnd once it advances past the final waypoint', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.wpIndex = e.waypoints.length - 1; // already at the last waypoint
    e.update(0.016);
    expect(e.reachedEnd).toBe(true);
  });

  it('updates facing based on horizontal movement direction (threshold 0.5px)', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    // First leg of the default path runs left-to-right (col 0 -> col 13 at row 1).
    e.update(0.016);
    expect(e.facing).toBe(1);
  });

  it("caps the competitor's trail history at 8 points", () => {
    const e = new Entities.Enemy('competitor', PATH.waypoints, 0);
    for (let i = 0; i < 20; i++) e.update(0.05);
    expect(e.trail.length).toBeLessThanOrEqual(8);
  });
});

describe('Projectile', () => {
  it('lob duration is distance/speed, floored at 0.15s', () => {
    const p = new Entities.Projectile({ kind: 'lob', x: 0, y: 0, targetX: 3, targetY: 4, speed: 1000, damage: 10, splash: 40 });
    expect(p.duration).toBe(0.15); // dist=5, 5/1000 << 0.15
  });

  it('lob arc height grows with distance', () => {
    const p = new Entities.Projectile({ kind: 'lob', x: 0, y: 0, targetX: 300, targetY: 0, speed: 200, damage: 10, splash: 40 });
    expect(p.arcHeight).toBeCloseTo(34 + 300 * 0.08);
  });

  it('lob impact damages enemies within splash radius at full damage, and beyond 55% splash at reduced damage', () => {
    const p = new Entities.Projectile({ kind: 'lob', x: 0, y: 0, targetX: 100, targetY: 0, speed: 200, damage: 20, splash: 40, color: '#fff', glow: '#fff' });
    p.groundY = 0; p.x = 100;
    const close = new Entities.Enemy('bug', PATH.waypoints, 0);
    close.x = 105; close.y = 0; // dist 5, inside 0.55*40=22
    const edge = new Entities.Enemy('bug', PATH.waypoints, 0);
    edge.x = 130; edge.y = 0; // dist 30, between 22 and 40 -> falloff
    const outside = new Entities.Enemy('bug', PATH.waypoints, 0);
    outside.x = 200; outside.y = 0; // dist 100, outside splash entirely

    const closeHp = close.hp, edgeHp = edge.hp, outsideHp = outside.hp;
    p.impact([close, edge, outside]);

    expect(close.hp).toBe(closeHp - 20);
    expect(edge.hp).toBe(edgeHp - 20 * 0.55);
    expect(outside.hp).toBe(outsideHp);
  });

  it('bolt impact damages only its locked target', () => {
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    const bystander = new Entities.Enemy('bug', PATH.waypoints, 0);
    const p = new Entities.Projectile({ kind: 'bolt', x: 0, y: 0, target, speed: 500, damage: 15, color: '#fff', glow: '#fff' });
    const targetHp = target.hp, bystanderHp = bystander.hp;
    p.impact([target, bystander]);
    expect(target.hp).toBe(targetHp - 15);
    expect(bystander.hp).toBe(bystanderHp);
  });

  it('bolt update() homes toward a live target and impacts once within 4px or overshooting', () => {
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = 50; target.y = 0;
    const p = new Entities.Projectile({ kind: 'bolt', x: 0, y: 0, target, speed: 1000, damage: 10, color: '#fff', glow: '#fff' });
    p.update(1, [target], []); // huge dt guarantees overshoot
    expect(p.dead).toBe(true);
  });
});
