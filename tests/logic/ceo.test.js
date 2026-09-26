import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, PATH, Core, Entities;

beforeEach(() => {
  // ceoGender/ceoName persist via localStorage across loadGame() calls by
  // design (see js/game.js's loadCeoGender etc.) —
  // clear it so tests that don't care about identity aren't affected by
  // whatever a previous test in this file left behind.
  try { localStorage.clear(); } catch (e) { /* not available in every env */ }
  Game = loadGame();
  CFG = Game.Config;
  PATH = Game.Path;
  Core = Game.Core;
  Entities = Game.Entities;
  PATH.relayout(1600, 1000);
});

describe('Core.runwayRatio', () => {
  it('is 1 with no hired teammates (nothing to burn)', () => {
    expect(Core.runwayRatio).toBe(1);
  });

  it('is budget / (payroll * 3), clamped to [0,1]', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;
    Core.budget = payroll * 1.5;
    expect(Core.runwayRatio).toBeCloseTo(0.5, 6);
  });

  it('never exceeds 1 even with a huge budget', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = Core.projectedPayroll * 100;
    expect(Core.runwayRatio).toBe(1);
  });

  it('never goes below 0 with a negative budget', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = -999999;
    expect(Core.runwayRatio).toBe(0);
  });
});

// ceoStateIndex reflects the company's CURRENT budget, not how far into the
// game it is — a late-game company that's currently broke should look it,
// not ride on an earlier stage's appearance. Deliberately independent of
// core.waves.stage / core.acquisitionMilestoneIndex.
describe('Core.ceoStateIndex — driven by current budget, not game progress', () => {
  it('is Crisis (0) whenever budget is negative, regardless of how much progress has been made', () => {
    Core.budget = -1;
    Core.waves.waveIndex = 10; // deep into Scale-Up
    Core.acquisitionMilestoneIndex = 3;
    expect(Core.ceoStateIndex).toBe(0);
  });

  it('treats budget exactly at 0 as non-Crisis, and the smallest negative amount as Crisis', () => {
    Core.budget = 0;
    expect(Core.ceoStateIndex).not.toBe(0);
    Core.budget = -0.01;
    expect(Core.ceoStateIndex).toBe(0);
  });

  it('walks through all 6 tiers purely by budget amount', () => {
    const t = CFG.CEO.wealthThresholds;
    Core.budget = 0;
    expect(Core.ceoStateIndex).toBe(1); // Bootstrapping
    Core.budget = t[0];
    expect(Core.ceoStateIndex).toBe(2); // Growing
    Core.budget = t[1];
    expect(Core.ceoStateIndex).toBe(3); // Established
    Core.budget = t[2];
    expect(Core.ceoStateIndex).toBe(4); // Successful
    Core.budget = t[3];
    expect(Core.ceoStateIndex).toBe(5); // Tycoon
  });

  it('rounds UP to the next tier exactly AT each threshold, both directions, for all 4 boundaries', () => {
    // budget < threshold is the tier-N condition, so budget === threshold
    // must already read as tier N+1 — check the smallest possible amount
    // on each side of every one of the 4 thresholds, not just the >= side.
    const t = CFG.CEO.wealthThresholds;
    const tierAtThreshold = [2, 3, 4, 5]; // tier when budget === t[i]
    for (let i = 0; i < t.length; i++) {
      Core.budget = t[i] - 1;
      expect(Core.ceoStateIndex, `t[${i}]-1`).toBe(tierAtThreshold[i] - 1);
      Core.budget = t[i];
      expect(Core.ceoStateIndex, `t[${i}] exactly`).toBe(tierAtThreshold[i]);
      Core.budget = t[i] + 1;
      expect(Core.ceoStateIndex, `t[${i}]+1`).toBe(tierAtThreshold[i]);
    }
  });

  it('a late-game company that is currently poor looks Bootstrapping, not Established/Tycoon', () => {
    Core.waves.waveIndex = 10; // Scale-Up, would have implied "Established" under the old stage-based design
    Core.acquisitionMilestoneIndex = 2; // would have implied "Tycoon"
    Core.budget = 100; // but actually nearly broke right now
    expect(Core.ceoStateIndex).toBe(1);
  });

  it('an early-game company that is currently rich looks the part immediately', () => {
    Core.waves.waveIndex = -1; // Pre-Seed, would have implied "Bootstrapping" under the old design
    Core.acquisitionMilestoneIndex = 0;
    Core.budget = CFG.CEO.wealthThresholds[3]; // Tycoon-level cash, e.g. from a lucky early run
    expect(Core.ceoStateIndex).toBe(5);
  });
});

describe('Core.confirmIdentity', () => {
  it('sets gender/name, mirrors gender onto stats, and starts the game by default', () => {
    Core.confirmIdentity('Ada', 'female');
    expect(Core.ceoGender).toBe('female');
    expect(Core.ceoName).toBe('Ada');
    expect(Core.stats.ceoGender).toBe('female');
    expect(Core.state).toBe('playing');
  });

  it('dispatches to restart() instead of start() when pendingGameAction is "restart" (the Start Over flow)', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.budget = 999;
    Core.pendingGameAction = 'restart';
    Core.confirmIdentity('Ada', 'female');
    expect(Core.state).toBe('playing');
    expect(Core.towers).toHaveLength(0); // restart() clears towers, start() would not
    expect(Core.budget).toBe(CFG.START_BUDGET);
  });

  it('falls back to the current gender for an invalid value instead of rejecting the whole call', () => {
    Core.ceoGender = 'male';
    Core.confirmIdentity('Grace', 'not-a-gender');
    expect(Core.ceoGender).toBe('male');
    expect(Core.ceoName).toBe('Grace');
  });

  it('trims whitespace and caps the name at 20 characters', () => {
    Core.confirmIdentity('   Alexandria The Great Founder   ', 'male');
    expect(Core.ceoName).toBe('Alexandria The Great'.slice(0, 20));
    expect(Core.ceoName.length).toBeLessThanOrEqual(20);
  });

  it('treats a non-string name as empty rather than throwing', () => {
    expect(() => Core.confirmIdentity(undefined, 'male')).not.toThrow();
    expect(Core.ceoName).toBe('');
  });

  it('persists gender/name across a fresh load, unlike run-scoped CEO state — used only to pre-fill the picker, not to skip it', () => {
    Core.confirmIdentity('Ada', 'female');
    const reloaded = loadGame();
    expect(reloaded.Core.ceoGender).toBe('female');
    expect(reloaded.Core.ceoName).toBe('Ada');
  });

  it('calling it again (a second game in the same session) re-persists the new values cleanly', () => {
    Core.confirmIdentity('Ada', 'female');
    Core.confirmIdentity('Grace', 'male');
    expect(Core.ceoGender).toBe('male');
    expect(Core.ceoName).toBe('Grace');
    const reloaded = loadGame();
    expect(reloaded.Core.ceoGender).toBe('male');
    expect(reloaded.Core.ceoName).toBe('Grace');
  });

  it('a whitespace-only name trims down to an empty string', () => {
    Core.confirmIdentity('    ', 'male');
    expect(Core.ceoName).toBe('');
  });

  it('rejects gender casing that does not exactly match "male"/"female", falling back instead of accepting it', () => {
    Core.ceoGender = 'female';
    Core.confirmIdentity('Ada', 'Male');
    expect(Core.ceoGender).toBe('female'); // fell back, did NOT accept 'Male'

    Core.ceoGender = 'male';
    Core.confirmIdentity('Ada', 'FEMALE');
    expect(Core.ceoGender).toBe('male'); // fell back, did NOT accept 'FEMALE'
  });
});

describe('Core.ceoDisplayName', () => {
  it('falls back to "The founder" when no name has been set', () => {
    Core.ceoName = '';
    expect(Core.ceoDisplayName).toBe('The founder');
  });

  it('uses the chosen name once set', () => {
    Core.ceoName = 'Ada';
    expect(Core.ceoDisplayName).toBe('Ada');
  });
});

describe('Core.useCeoAbility', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('does nothing while budget is negative', () => {
    Core.budget = -1;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
  });

  it('does nothing while on cooldown', () => {
    Core.budget = 1000;
    Core.ceoAbilityCooldown = 5000;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('does nothing outside the playing state', () => {
    Core.state = 'paused';
    Core.budget = 1000;
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(0);
  });

  it('damages enemies within radius, leaves far ones untouched, and sets buff/cooldown/use-count', () => {
    Core.budget = 1000;
    const anchor = PATH.ceoAnchor;
    const near = new Entities.Enemy('bug', PATH.waypoints, 0);
    near.x = anchor.x + 10; near.y = anchor.y;
    const nearHpBefore = near.hp;
    const far = new Entities.Enemy('bug', PATH.waypoints, 0);
    far.x = anchor.x + CFG.CEO.abilityRadius + 500; far.y = anchor.y;
    const farHpBefore = far.hp;
    Core.enemies = [near, far];

    Core.useCeoAbility();

    expect(near.hp).toBeLessThan(nearHpBefore);
    expect(far.hp).toBe(farHpBefore);
    expect(Core.ceoBuffTimer).toBe(CFG.CEO.abilityBuffDurationMs);
    expect(Core.ceoAbilityCooldown).toBeGreaterThan(0);
    expect(Core.stats.ceoAbilityUses).toBe(1);
  });

  it('gives a shorter cooldown the healthier the runway ratio', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    const payroll = Core.projectedPayroll;

    Core.budget = payroll * 3; // ratio 1, healthiest possible
    Core.useCeoAbility();
    const healthyCooldown = Core.ceoAbilityCooldown;

    Core.ceoAbilityCooldown = 0;
    Core.budget = payroll * 0.3; // struggling but not negative
    Core.useCeoAbility();
    const struggleCooldown = Core.ceoAbilityCooldown;

    expect(healthyCooldown).toBeCloseTo(CFG.CEO.abilityCooldownMinMs, 6);
    expect(healthyCooldown).toBeLessThan(struggleCooldown);
  });

  it('spawns the grand effect (rings, flash, screen banner) and plays the fanfare, not the old funding-round cue', () => {
    Core.budget = 1000;
    const before = Core.effects.length;
    Core.useCeoAbility();
    const added = Core.effects.slice(before);
    expect(added.filter((fx) => fx.type === 'ring')).toHaveLength(3);
    expect(added.some((fx) => fx.type === 'flash')).toBe(true);
    expect(added.some((fx) => fx.type === 'bigPayday' && fx.text === 'ALL-HANDS!')).toBe(true);
  });
});

describe('Core.useCeoAbility — enemy loop edge cases', () => {
  beforeEach(() => { Core.state = 'playing'; Core.budget = 1000; });

  it('does not throw and still sets buff/cooldown/use-count with zero enemies', () => {
    Core.enemies = [];
    expect(() => Core.useCeoAbility()).not.toThrow();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoBuffTimer).toBe(CFG.CEO.abilityBuffDurationMs);
  });

  it('skips dead and reachedEnd enemies even when they sit inside the radius', () => {
    const anchor = PATH.ceoAnchor;
    const dead = new Entities.Enemy('bug', PATH.waypoints, 0);
    dead.x = anchor.x; dead.y = anchor.y; dead.dead = true;
    const deadHpBefore = dead.hp;
    const ended = new Entities.Enemy('bug', PATH.waypoints, 0);
    ended.x = anchor.x; ended.y = anchor.y; ended.reachedEnd = true;
    const endedHpBefore = ended.hp;
    Core.enemies = [dead, ended];

    Core.useCeoAbility();

    expect(dead.hp).toBe(deadHpBefore);
    expect(ended.hp).toBe(endedHpBefore);
  });
});

describe('Core.triggerAllHandsEffect — effect lifecycle does not leak', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('calling it many times back-to-back (bypassing the cooldown guard) still gets every effect pruned once its life elapses', () => {
    const anchor = PATH.ceoAnchor;
    // Call the effect-pushing method directly (not useCeoAbility(), which
    // is cooldown-gated) to simulate the leak scenario: many bursts firing
    // in immediate succession.
    for (let i = 0; i < 25; i++) Core.triggerAllHandsEffect(anchor);

    // 3 rings + 1 flash + 1 bigPayday per call = 5 new effects each time.
    expect(Core.effects.length).toBe(25 * 5);
    const newTypes = ['ring', 'flash', 'bigPayday'];
    expect(Core.effects.filter((fx) => newTypes.includes(fx.type)).length).toBe(25 * 5);

    // The longest-lived effect here is bigPayday at 1.8s life. Advancing
    // update() past that must prune ALL of them via the generic
    // `fx.life > 0` filter in update() — not just the old effect types.
    Core.update(2.0);
    expect(Core.effects.filter((fx) => newTypes.includes(fx.type))).toHaveLength(0);
    expect(Core.effects).toHaveLength(0);
  });

  it('effects accumulated across many bursts are pruned incrementally, not left to grow unboundedly across frames', () => {
    const anchor = PATH.ceoAnchor;
    Core.triggerAllHandsEffect(anchor); // life values: rings 0.5/0.7/0.9, flash 0.3, bigPayday 1.8
    Core.update(0.2); // nothing has expired yet (shortest life is flash at 0.3)
    expect(Core.effects.length).toBe(5);

    Core.triggerAllHandsEffect(anchor); // 5 more added on top of the still-alive 5
    expect(Core.effects.length).toBe(10);

    Core.update(0.35); // first burst's flash(0.3) and ring(0.5) expire relative to their own countdowns
    // Exact survivors depend on per-fx life, but the count must strictly
    // decrease (proof effects are actually being pruned, not just piling up).
    expect(Core.effects.length).toBeLessThan(10);

    Core.update(5); // more than long enough for everything remaining to expire
    expect(Core.effects).toHaveLength(0);
  });
});

describe('Core.useCeoAbility — repeated calls do not compound/stack', () => {
  beforeEach(() => { Core.state = 'playing'; });

  it('a second immediate call while on cooldown changes nothing (buff timer does not stack, use-count does not increment)', () => {
    Core.budget = 1000;
    Core.useCeoAbility();
    const buffAfterFirst = Core.ceoBuffTimer;
    const cooldownAfterFirst = Core.ceoAbilityCooldown;
    Core.useCeoAbility(); // still on cooldown
    Core.useCeoAbility();
    expect(Core.stats.ceoAbilityUses).toBe(1);
    expect(Core.ceoBuffTimer).toBe(buffAfterFirst);
    expect(Core.ceoAbilityCooldown).toBe(cooldownAfterFirst);
  });

  it('repeated restart() calls in sequence leave CEO run state cleanly zeroed, not compounded', () => {
    Core.budget = 1000;
    Core.useCeoAbility();
    Core.restart();
    Core.restart();
    Core.restart();
    expect(Core.ceoAbilityCooldown).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.ceoIncomeTimer).toBe(0);
  });
});

describe('Core.updateCeo — income timer carryover across a single large dt', () => {
  it('a dt covering exactly 2.5x the income interval only pays out once per updateCeo call (timer does not loop internally)', () => {
    // Documents actual behavior of the `if (timer >= interval)` check in
    // updateCeo (js/game.js) rather than a `while` loop — provably
    // unreachable through the real game loop, which hard-clamps dt to at
    // most 0.05s * 4x speed = 0.2s, far below any realistic interval; see
    // js/game.js's loop(). Kept as documentation, not a bug report.
    Core.budget = 0; // Bootstrapping, state 1
    const before = Core.budget;
    const intervalSec = CFG.CEO.incomeIntervalMs / 1000;
    Core.updateCeo(intervalSec * 2.5);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]); // only ONE payout, not two
    expect(Core.stats.income).toBe(CFG.CEO.incomeByState[1]);
    expect(Core.ceoIncomeTimer).toBeCloseTo(CFG.CEO.incomeIntervalMs * 1.5, 6);
    Core.updateCeo(0);
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1] * 2);
  });

  it('carries a sub-interval remainder forward across two smaller calls that together cross the interval', () => {
    Core.budget = 0;
    const before = Core.budget;
    const intervalSec = CFG.CEO.incomeIntervalMs / 1000;
    Core.updateCeo(intervalSec * 0.6);
    expect(Core.budget).toBe(before); // not yet due
    Core.updateCeo(intervalSec * 0.5); // 0.6 + 0.5 = 1.1x -> one payout, 0.1x carried
    expect(Core.budget).toBe(before + CFG.CEO.incomeByState[1]);
    expect(Core.ceoIncomeTimer).toBeCloseTo(CFG.CEO.incomeIntervalMs * 0.1, 6);
  });
});

describe('Core.updateCeo — milestone toasts', () => {
  beforeEach(() => { document.getElementById('toast').textContent = ''; });

  it('fires a toast the first time a new peak state is reached this run', () => {
    Core.ceoName = 'Ada';
    Core.budget = CFG.CEO.wealthThresholds[0]; // Growing (2)
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toContain('Ada');
  });

  it('does not re-fire when dropping back into an already-reached tier', () => {
    Core.budget = CFG.CEO.wealthThresholds[2]; // Successful (4) — new peak
    Core.updateCeo(0.1);
    document.getElementById('toast').textContent = '';
    Core.budget = CFG.CEO.wealthThresholds[0]; // drop to Growing (2), still below the peak
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toBe('');
  });

  it('does not fire a milestone toast for Bootstrapping (the starting tier)', () => {
    Core.budget = 0; // Bootstrapping (1)
    Core.updateCeo(0.1);
    expect(document.getElementById('toast').textContent).toBe('');
  });

  it('oscillating rapidly across the same threshold many times only toasts once, not per crossing', () => {
    const t = CFG.CEO.wealthThresholds;
    let toastCount = 0;
    const toastEl = document.getElementById('toast');
    // Crude toast-fire counter: textContent changing to a non-empty value
    // counts as a fire; clear it after every updateCeo call like the other
    // toast tests do, so a repeat fire would be visible.
    for (let i = 0; i < 10; i++) {
      Core.budget = i % 2 === 0 ? t[0] : t[0] - 1; // hop across the Growing boundary
      toastEl.textContent = '';
      Core.updateCeo(0.1);
      if (toastEl.textContent !== '') toastCount++;
    }
    expect(toastCount).toBe(1); // only the very first crossing (new peak) fires
    expect(Core.stats.ceoPeakState).toBe(2); // Growing, the highest tier actually reached
  });

  it('dropping to Crisis and recovering, then reaching a NEW peak above the old one, still toasts correctly', () => {
    const t = CFG.CEO.wealthThresholds;
    const toastEl = document.getElementById('toast');

    Core.budget = t[0]; // Growing (2) — first peak
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toContain("'s startup is starting to take off.");
    expect(Core.stats.ceoPeakState).toBe(2);

    Core.budget = -1; // Crisis (0) — drop far below the peak
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toBe(''); // no milestone toast for dropping down
    expect(Core.stats.ceoPeakState).toBe(2); // peak unchanged by a drop

    Core.budget = t[2]; // Successful (4) — a genuinely NEW peak above the old one
    toastEl.textContent = '';
    Core.updateCeo(0.1);
    expect(toastEl.textContent).toContain(' just became a certified Successful founder.');
    expect(Core.stats.ceoPeakState).toBe(4);
  });
});

describe('Core.update — Crisis-entry toast', () => {
  it('fires once, personalized, the frame budget first goes negative', () => {
    Core.state = 'playing';
    Core.ceoName = 'Ada';
    Core.budget = -1;
    document.getElementById('toast').textContent = '';
    Core.update(0.1);
    expect(document.getElementById('toast').textContent).toContain('Ada');
  });

  it('does not re-fire on a later frame while still negative', () => {
    Core.state = 'playing';
    Core.budget = -1;
    Core.update(0.1); // enters crisis, grace timer starts
    document.getElementById('toast').textContent = '';
    Core.update(0.1); // still negative, same grace period
    expect(document.getElementById('toast').textContent).toBe('');
  });
});

describe('Core.auraRateMultFor with an active CEO buff', () => {
  it('folds the ability buff multiplier in, same hook the coffee aura already uses', () => {
    Core.ceoBuffTimer = 1000;
    expect(Core.auraRateMultFor()).toBe(CFG.CEO.abilityBuffFireRateMult);
  });

  it('is unaffected once the buff expires', () => {
    Core.ceoBuffTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
  });

  it('takes whichever effect gives the bigger speed boost (the smaller multiplier)', () => {
    Core.budget = 100000; // coffee machine costs more than START_BUDGET
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.ceoBuffTimer = 1000;
    const coffeeMult = Core.towers[0].auraRateMultValue;
    expect(Core.auraRateMultFor()).toBe(Math.min(coffeeMult, CFG.CEO.abilityBuffFireRateMult));
  });
});

describe('Core.auraRateMultFor — CEO buff + coffee aura interaction', () => {
  it('a stunned coffee machine is excluded, so an active CEO buff is the only effect applied', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.towers[0].stunTimer = 1000; // stunned -> excluded from the aura loop
    Core.ceoBuffTimer = 1000;
    expect(Core.auraRateMultFor()).toBe(CFG.CEO.abilityBuffFireRateMult);
  });

  it('an active coffee aura with no CEO buff yields just the coffee multiplier', () => {
    Core.budget = 100000;
    const cs = CFG.COFFEE_SPOT;
    Core.hireAt(cs.col, cs.row, 'coffee');
    Core.ceoBuffTimer = 0;
    const coffeeMult = Core.towers[0].auraRateMultValue;
    expect(Core.auraRateMultFor()).toBe(coffeeMult);
  });

  it('neither effect active yields exactly 1 (no towers at all)', () => {
    Core.towers = [];
    Core.ceoBuffTimer = 0;
    expect(Core.auraRateMultFor()).toBe(1);
  });
});

describe('Core.restart resets CEO run state but keeps the identity preferences', () => {
  it('resets ability/buff/income timers and per-run stats, keeps gender/name', () => {
    Core.confirmIdentity('Ada', 'female');
    Core.ceoAbilityCooldown = 5000;
    Core.ceoBuffTimer = 2000;
    Core.stats.ceoAbilityUses = 3;
    Core.stats.ceoCrisisMs = 4000;
    Core.stats.ceoPeakState = 5;

    Core.restart();

    expect(Core.ceoGender).toBe('female');
    expect(Core.ceoName).toBe('Ada');
    expect(Core.stats.ceoGender).toBe('female');
    expect(Core.ceoAbilityCooldown).toBe(0);
    expect(Core.ceoBuffTimer).toBe(0);
    expect(Core.stats.ceoAbilityUses).toBe(0);
    expect(Core.stats.ceoCrisisMs).toBe(0);
    expect(Core.stats.ceoPeakState).toBe(0);
  });
});
