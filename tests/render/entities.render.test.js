// Smoke coverage for entities.js's rendering/attack-triggering surface —
// see tests/README.md for why this tier asserts "runs without throwing and
// takes the right branch" rather than pixel/call-count assertions.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';
import { installFakeImage } from '../helpers/fakeImage.js';

let Game, CFG, Entities, PATH, Core, ctx;

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  Entities = Game.Entities;
  PATH = Game.Path;
  Core = Game.Core;
  PATH.relayout(1600, 1000);
  ctx = document.getElementById('gameCanvas').getContext('2d');
});

describe('Tower.update — attack triggering (real behavior, not just smoke)', () => {
  it('bolt (engineer): fires a projectile at an in-range target once cooldown allows', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = t.x; target.y = t.y;
    const projectiles = [];
    t.cooldownTimer = 0;
    t.update(0.016, [target], projectiles, []);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0].kind).toBe('bolt');
    expect(t.cooldownTimer).toBe(t.fireRate);
  });

  it("doesn't fire again while its cooldown hasn't elapsed", () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = t.x; target.y = t.y;
    const projectiles = [];
    t.cooldownTimer = 5000;
    t.update(0.016, [target], projectiles, []);
    expect(projectiles).toHaveLength(0);
  });

  it('lob (sre): fires a lob projectile aimed ahead of the target using its travel time', () => {
    const t = new Entities.Tower('sre', 2, 0, PATH.cellCenter(2, 0));
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = t.x; target.y = t.y; target.wpIndex = 0;
    const projectiles = [];
    t.cooldownTimer = 0;
    t.update(0.016, [target], projectiles, []);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0].kind).toBe('lob');
  });

  it('lightning (qa): damages+slows the primary target directly (no projectile) and can chain to a second', () => {
    const t = new Entities.Tower('qa', 2, 0, PATH.cellCenter(2, 0));
    const primary = new Entities.Enemy('bug', PATH.waypoints, 0);
    primary.x = t.x; primary.y = t.y;
    const chain = new Entities.Enemy('bug', PATH.waypoints, 0);
    chain.x = t.x + 20; chain.y = t.y;
    const primaryHp = primary.hp, chainHp = chain.hp;
    const projectiles = [], effects = [];
    t.cooldownTimer = 0;
    t.update(0.016, [primary, chain], projectiles, effects);
    expect(projectiles).toHaveLength(0); // lightning is instant, not a projectile
    expect(primary.hp).toBeLessThan(primaryHp);
    expect(primary.slowTimer).toBeGreaterThan(0);
    expect(chain.hp).toBeLessThan(chainHp); // within chainRange of the primary
    expect(effects.some(e => e.type === 'lightning')).toBe(true);
  });

  it('income (pm): generates budget once its interval elapses, with no target/projectile involved', () => {
    const t = new Entities.Tower('pm', 2, 0, PATH.cellCenter(2, 0));
    const budgetBefore = Core.budget;
    const interval = CFG.TOWER_TYPES.pm.interval;
    t.update(interval / 1000 + 0.01, [], [], []);
    expect(Core.budget).toBeGreaterThan(budgetBefore);
  });

  it('aura (coffee): update is a total no-op — passive, read live by other towers instead', () => {
    const t = new Entities.Tower('coffee', CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, PATH.cellCenter(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row));
    const cooldownBefore = t.cooldownTimer;
    const projectiles = [];
    t.update(0.016, [], projectiles, []);
    expect(projectiles).toHaveLength(0);
    expect(t.cooldownTimer).toBe(cooldownBefore);
  });

  it('a stunned tower fires nothing and just counts down its stun', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = t.x; target.y = t.y;
    t.stunTimer = 2000;
    t.cooldownTimer = 0;
    const projectiles = [];
    t.update(0.016, [target], projectiles, []);
    expect(projectiles).toHaveLength(0);
    expect(t.stunTimer).toBeLessThan(2000);
  });
});

describe('Tower.draw — every role, procedural fallback (no art loaded)', () => {
  it.each(['engineer', 'sre', 'qa', 'pm', 'coffee'])('%s draws without throwing at level 1 and level 4', (type) => {
    const pos = type === 'coffee' ? CFG.COFFEE_SPOT : { col: 2, row: 0 };
    const t = new Entities.Tower(type, pos.col, pos.row, PATH.cellCenter(pos.col, pos.row));
    expect(() => t.draw(ctx)).not.toThrow();
    t.level = 4;
    expect(() => t.draw(ctx)).not.toThrow();
  });

  it('draws the stunned (grayed-out + flame) state without throwing', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    t.stunTimer = 1000;
    expect(() => t.draw(ctx)).not.toThrow();
  });

  it('draws the hovered (highlighted) state without throwing', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    t.hovered = true;
    expect(() => t.draw(ctx)).not.toThrow();
  });

  it('draws the charge-up glow while mid-cooldown (about to fire again)', () => {
    const t = new Entities.Tower('engineer', 2, 0, PATH.cellCenter(2, 0));
    t.cooldownTimer = 120; // inside the (0, 260) charge window
    expect(() => t.draw(ctx)).not.toThrow();
  });
});

describe('Tower.draw — real sprite art loaded', () => {
  beforeEach(async () => {
    installFakeImage();
    await new Promise((resolve) => Game.Assets.loadAll(resolve));
  });

  it.each(['engineer', 'sre', 'qa', 'pm', 'coffee'])('%s draws via the real sprite-art branch without throwing', (type) => {
    const pos = type === 'coffee' ? CFG.COFFEE_SPOT : { col: 2, row: 0 };
    const t = new Entities.Tower(type, pos.col, pos.row, PATH.cellCenter(pos.col, pos.row));
    expect(() => t.draw(ctx)).not.toThrow();
  });
});

describe('Enemy.draw — every type, procedural fallback', () => {
  it.each(['bug', 'competitor', 'incident'])('%s draws without throwing, healthy and damaged', (type) => {
    const e = new Entities.Enemy(type, PATH.waypoints, 0);
    expect(() => e.draw(ctx)).not.toThrow();
    e.takeDamage(1);
    expect(() => e.draw(ctx)).not.toThrow();
  });

  it('draws the slowed (QA-frozen) ring without throwing', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.applySlow(0.4, 1000);
    expect(() => e.draw(ctx)).not.toThrow();
  });

  it('a competitor with an active trail draws without throwing', () => {
    const e = new Entities.Enemy('competitor', PATH.waypoints, 0);
    e.update(0.1); // populates the trail
    expect(() => e.draw(ctx)).not.toThrow();
  });

  it('a damaged, hitFlash-lit competitor draws its alternate (white flash) gradient and hp bar', () => {
    const e = new Entities.Enemy('competitor', PATH.waypoints, 0);
    e.takeDamage(1); // sets hitFlash > 0 and hp < maxHp
    expect(() => e.draw(ctx)).not.toThrow();
  });

  it('a slowed incident draws its frozen ring', () => {
    const e = new Entities.Enemy('incident', PATH.waypoints, 0);
    e.applySlow(0.3, 1000);
    expect(() => e.draw(ctx)).not.toThrow();
  });
});

describe('Enemy.draw — real sprite art loaded (bug/competitor only; incident is always procedural fire)', () => {
  beforeEach(async () => {
    installFakeImage();
    await new Promise((resolve) => Game.Assets.loadAll(resolve));
  });

  it.each(['bug', 'competitor'])('%s draws via the real sprite-art branch without throwing', (type) => {
    const e = new Entities.Enemy(type, PATH.waypoints, 0);
    expect(() => e.draw(ctx)).not.toThrow();
  });

  it('a damaged, slowed bug draws its sprite-branch hp bar and frozen ring without throwing', () => {
    const e = new Entities.Enemy('bug', PATH.waypoints, 0);
    e.takeDamage(1);
    e.applySlow(0.3, 1000);
    expect(() => e.draw(ctx)).not.toThrow();
  });
});

describe('Projectile.draw', () => {
  it('draws a bolt projectile mid-flight, including its fading trail, without throwing', () => {
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = 300; target.y = 0;
    const p = new Entities.Projectile({ kind: 'bolt', x: 0, y: 0, target, speed: 50, damage: 10, color: '#fff', glow: '#fff' });
    p.update(0.01, [target], []); // a small step: populates the trail without impacting yet
    expect(() => p.draw(ctx)).not.toThrow();
  });

  it('draws a lob projectile (including its ground shadow) without throwing', () => {
    const p = new Entities.Projectile({ kind: 'lob', x: 10, y: 10, targetX: 50, targetY: 10, speed: 200, damage: 10, splash: 40, color: '#fff', glow: '#fff' });
    p.groundY = 10;
    expect(() => p.draw(ctx)).not.toThrow();
  });
});

describe('Projectile.update', () => {
  it('lob: advances along its arc, occasionally trailing particles, then impacts on arrival', () => {
    const p = new Entities.Projectile({ kind: 'lob', x: 0, y: 0, targetX: 100, targetY: 0, speed: 50, damage: 10, splash: 40, color: '#fff', glow: '#fff' });
    const particles = [];
    // Small steps covering the full flight — across enough ticks, the
    // probabilistic particle trail (Math.random() < 0.6 per tick) fires too.
    for (let i = 0; i < 30 && !p.dead; i++) p.update(p.duration / 25, [], particles);
    expect(p.dead).toBe(true);
    expect(particles.length).toBeGreaterThan(0);
  });

  it("bolt: falls back to the target's last known position once it dies/leaks mid-flight", () => {
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = 300; target.y = 0;
    const p = new Entities.Projectile({ kind: 'bolt', x: 0, y: 0, target, speed: 50, damage: 10, color: '#fff', glow: '#fff' });
    p.update(0.01, [target], []); // records lastX/lastY while the target is still alive
    target.dead = true;
    expect(() => p.update(0.01, [target], [])).not.toThrow();
    expect(p.lastX).toBeDefined();
  });

  it('bolt: keeps homing (no impact yet) while still short of the target', () => {
    const target = new Entities.Enemy('bug', PATH.waypoints, 0);
    target.x = 1000; target.y = 0;
    const p = new Entities.Projectile({ kind: 'bolt', x: 0, y: 0, target, speed: 50, damage: 10, color: '#fff', glow: '#fff' });
    p.update(0.01, [target], []);
    expect(p.dead).toBe(false);
    expect(p.x).toBeGreaterThan(0);
  });
});
