import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, CFG, UI, Core;

function el(id) { return document.getElementById(id); }

beforeEach(() => {
  Game = loadGame();
  CFG = Game.Config;
  UI = Game.UI;
  Core = Game.Core;
  Game.Path.relayout(1600, 1000);
  UI.init(Core);
});

describe('UI.init', () => {
  it('shows the start screen and hides the game-over screen', () => {
    expect(el('screen-start').classList.contains('hidden')).toBe(false);
    expect(el('screen-gameover').classList.contains('hidden')).toBe(true);
  });

  it('wires the Launch button to Core.start()', () => {
    el('startBtn').click();
    expect(Core.state).toBe('playing');
  });

  it('wires the pause overlay click to Core.togglePause()', () => {
    Core.state = 'playing';
    el('pauseOverlay').click();
    expect(Core.state).toBe('paused');
  });
});

describe('UI.renderTimeline / updateTimeline', () => {
  it('creates one stage dot per funding stage', () => {
    expect(document.querySelectorAll('.timeline-stage')).toHaveLength(CFG.FUNDING_STAGES.length);
  });

  it('marks stages as reached/current and fills the track proportionally to progress', () => {
    Core.waves.waveIndex = CFG.FUNDING_STAGES[1].triggerSprint - 1; // now in stage 1
    UI.updateTimeline();
    const dots = [...document.querySelectorAll('.timeline-stage')];
    const stage0 = dots.find(d => d.dataset.key === CFG.FUNDING_STAGES[0].key);
    const stage1 = dots.find(d => d.dataset.key === CFG.FUNDING_STAGES[1].key);
    expect(stage0.classList.contains('reached')).toBe(true);
    expect(stage1.classList.contains('current')).toBe(true);
  });

  it('shows a countdown to the next stage, or the endless message once in Scale-Up', () => {
    UI.updateTimeline();
    expect(el('timelineNext').textContent).toMatch(/^Next: /);
    Core.waves.waveIndex = CFG.FUNDING_STAGES.at(-1).triggerSprint - 1;
    UI.updateTimeline();
    expect(el('timelineNext').textContent).toMatch(/endless/i);
  });
});

describe('UI.showHirePanel', () => {
  it('hides and clears the panel when passed null', () => {
    UI.showHirePanel(CFG.DESK_POSITIONS[0]);
    UI.showHirePanel(null);
    expect(el('hirePanel').classList.contains('hidden')).toBe(true);
    expect(el('hirePanel').innerHTML).toBe('');
  });

  it('renders one hire button per non-coffee role', () => {
    UI.showHirePanel(CFG.DESK_POSITIONS[0]);
    const buttons = el('hirePanel').querySelectorAll('button');
    const nonCoffeeRoles = Object.keys(CFG.TOWER_TYPES).filter(k => k !== 'coffee');
    expect(buttons).toHaveLength(nonCoffeeRoles.length);
  });

  it('disables a role button once its cooldown is active', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer'); // starts engineer's cooldown
    UI.showHirePanel(CFG.DESK_POSITIONS[1]);
    const btn = el('hirePanel').querySelector('button[data-type="engineer"]');
    expect(btn.disabled).toBe(true);
    expect(btn.className).toMatch(/disabled/);
  });

  it('clicking a role button hires that role at the desk', () => {
    const d = CFG.DESK_POSITIONS[0];
    UI.showHirePanel(d);
    el('hirePanel').querySelector('button[data-type="engineer"]').click();
    expect(Core.towers).toHaveLength(1);
    expect(Core.towers[0].type).toBe('engineer');
  });
});

describe('UI.refreshHirePanel', () => {
  it('does nothing while the panel is hidden', () => {
    UI.showHirePanel(null);
    expect(() => UI.refreshHirePanel()).not.toThrow();
  });

  it('live-updates the cooldown bar height without rebuilding the panel', () => {
    const d0 = CFG.DESK_POSITIONS[0];
    const d1 = CFG.DESK_POSITIONS[1];
    Core.hireAt(d0.col, d0.row, 'engineer');
    UI.showHirePanel(d1);
    Core.cardCooldowns.engineer = CFG.TOWER_TYPES.engineer.cooldown / 2;
    UI.refreshHirePanel();
    const bar = el('hirePanel').querySelector('button[data-type="engineer"] .card-cooldown');
    expect(bar.style.height).toBe('50%');
  });
});

describe('UI.updateHUD', () => {
  it('reflects budget/payroll/best-sprint', () => {
    Core.budget = 12345;
    Core.bestSprint = 7;
    UI.updateHUD();
    expect(el('budgetValue').textContent).toBe(Game.fmt(12345));
    expect(el('bestSprintValue').textContent).toBe('7');
  });

  it('flags the budget red once negative', () => {
    Core.budget = -50;
    UI.updateHUD();
    expect(el('budgetValue').classList.contains('negative')).toBe(true);
  });

  it('hides the whole countdown card and Skip Wait while a sprint is active (nothing to count down to, and it would just cover the map)', () => {
    Core.waves.active = true;
    UI.updateHUD();
    expect(el('countdownBanner').classList.contains('hidden')).toBe(true);
    expect(el('nextSprintBtn').classList.contains('hidden')).toBe(true);
  });

  it('shows the live countdown and Skip Wait between sprints, urgent once <=3s remain', () => {
    Core.waves.active = false;
    Core.waves.betweenTimer = 5;
    UI.updateHUD();
    expect(el('countdownBanner').classList.contains('hidden')).toBe(false);
    expect(el('countdownValue').textContent).toBe('5s');
    expect(el('nextSprintBtn').classList.contains('hidden')).toBe(false);
    expect(el('countdownBanner').classList.contains('urgent')).toBe(false);
    Core.waves.betweenTimer = 2;
    UI.updateHUD();
    expect(el('countdownBanner').classList.contains('urgent')).toBe(true);
  });

  it('shows the crisis warning while the negative-budget grace timer is running', () => {
    Core.negativeBudgetTimer = 4;
    UI.updateHUD();
    const warn = el('paydayWarning');
    expect(warn.classList.contains('hidden')).toBe(false);
    expect(warn.classList.contains('crisis')).toBe(true);
    expect(warn.textContent).toMatch(/OUT OF MONEY/);
  });

  it('warns ahead of a payday that would push the budget negative', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.waves.waveIndex = 0; // a sprint has started, so a payday warning is relevant
    Core.waves.active = false;
    Core.budget = Core.towers[0].salary - 1; // payday would go negative
    UI.updateHUD();
    expect(el('paydayWarning').classList.contains('hidden')).toBe(false);
    expect(el('paydayWarning').textContent).toMatch(/WARNING/);
  });

  it('reflects pause/mute/speed control state', () => {
    Core.state = 'paused';
    Core.muted = true;
    Core.speed = 2;
    UI.updateHUD();
    expect(el('pauseBtn').textContent).toBe('Resume');
    expect(el('pauseOverlay').classList.contains('hidden')).toBe(false);
    expect(el('muteBtn').textContent).toBe('Sound: Off');
    expect(el('speedValue').textContent).toBe('2x');
    expect(el('speedBtn').classList.contains('active')).toBe(true);
  });

  it('populates the end-of-run stats card once the game is over', () => {
    Core.state = 'gameover';
    Core.lastReachedSprint = 6;
    Core.bestSprint = 9;
    Core.stats = { income: 5000, salaries: 2000, lost: 1200, kills: 34 };
    UI.updateHUD();
    expect(el('gameoverTitle').textContent).toBe('Ran Out of Money');
    expect(el('statSprintValue').textContent).toBe('6');
    expect(el('statBestValue').textContent).toBe('9');
    expect(el('statIncome').textContent).toBe(Game.fmt(5000));
    expect(el('statSalaries').textContent).toBe(Game.fmt(2000));
    expect(el('statLost').textContent).toBe(Game.fmt(1200));
    expect(el('statKills').textContent).toBe('34');
  });
});

describe('UI.updateUpgradePanel', () => {
  it('hides the panel with no tower selected', () => {
    Core.selectedTower = null;
    UI.updateUpgradePanel();
    expect(el('upgradePanel').classList.contains('hidden')).toBe(true);
  });

  it('shows the next-rank preview, cost, and an enabled button when affordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 999999;
    UI.updateUpgradePanel();
    expect(el('upgradePanel').classList.contains('hidden')).toBe(false);
    expect(el('upMaxed').classList.contains('hidden')).toBe(true);
    expect(el('upgradeBtn').classList.contains('hidden')).toBe(false);
    expect(el('upgradeBtn').disabled).toBe(false);
  });

  it('disables the upgrade button when unaffordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 0;
    UI.updateUpgradePanel();
    expect(el('upgradeBtn').disabled).toBe(true);
  });

  it('shows MAX and hides the upgrade button at the level cap', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.towers[0].level = CFG.MAX_TOWER_LEVEL;
    Core.selectedTower = Core.towers[0];
    UI.updateUpgradePanel();
    expect(el('upMaxed').classList.contains('hidden')).toBe(false);
    expect(el('upgradeBtn').classList.contains('hidden')).toBe(true);
  });

  it('shows the aura note only for the coffee machine', () => {
    Core.budget = 999999;
    Core.hireAt(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, 'coffee');
    Core.selectedTower = Core.towers[0];
    UI.updateUpgradePanel();
    expect(el('upAuraNote').classList.contains('hidden')).toBe(false);
  });
});

describe('UI.positionUpgradePanel', () => {
  it('does nothing while the panel is hidden', () => {
    Core.selectedTower = null;
    UI.updateUpgradePanel();
    expect(() => UI.positionUpgradePanel({ x: 100, y: 100 }, el('gameCanvas'))).not.toThrow();
  });

  it('positions the panel without throwing once visible', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    UI.updateUpgradePanel();
    expect(() => UI.positionUpgradePanel(Core.towers[0], el('gameCanvas'))).not.toThrow();
  });
});

describe('UI.showToast', () => {
  beforeEach(() => vi.useFakeTimers());

  it('shows the message and auto-hides it after its timeout', () => {
    UI.showToast('Hello!');
    expect(el('toast').textContent).toBe('Hello!');
    expect(el('toast').classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(el('toast').classList.contains('hidden')).toBe(true);
  });
});

describe('UI.showScreen', () => {
  it('shows exactly the named screen and hides the rest', () => {
    UI.showScreen('gameover');
    expect(el('screen-gameover').classList.contains('hidden')).toBe(false);
    expect(el('screen-start').classList.contains('hidden')).toBe(true);
  });

  it('hides every screen when passed null', () => {
    UI.showScreen(null);
    expect(el('screen-start').classList.contains('hidden')).toBe(true);
    expect(el('screen-gameover').classList.contains('hidden')).toBe(true);
  });
});
