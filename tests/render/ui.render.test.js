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
  it('shows the menu screen (main panel) and hides the game-over screen', () => {
    expect(el('screen-menu').classList.contains('hidden')).toBe(false);
    expect(el('screen-gameover').classList.contains('hidden')).toBe(true);
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuInstructionsPanel').classList.contains('hidden')).toBe(true);
    expect(el('menuLeaderboardPanel').classList.contains('hidden')).toBe(true);
  });

  it('wires the Play button to Core.start()', () => {
    el('menuPlayBtn').click();
    expect(Core.state).toBe('playing');
  });

  it('wires the Play button to Core.togglePause() (as Resume) when a run is paused', () => {
    Core.state = 'playing';
    Core.togglePause();
    expect(Core.state).toBe('paused');
    el('menuPlayBtn').click();
    expect(Core.state).toBe('playing');
  });
});

describe('UI.showMenuPanel', () => {
  it('switches between main/instructions/leaderboard and back again', () => {
    el('menuInstructionsBtn').click();
    expect(el('menuInstructionsPanel').classList.contains('hidden')).toBe(false);
    expect(el('menuMain').classList.contains('hidden')).toBe(true);
    el('instructionsBackBtn').click();
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuInstructionsPanel').classList.contains('hidden')).toBe(true);

    el('menuLeaderboardBtn').click();
    expect(el('menuLeaderboardPanel').classList.contains('hidden')).toBe(false);
    el('leaderboardBackBtn').click();
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuLeaderboardPanel').classList.contains('hidden')).toBe(true);
  });

  it('fetches and renders the leaderboard when the panel opens', async () => {
    vi.spyOn(Game.Leaderboard, 'fetchLeaderboard').mockResolvedValue([{ name: 'Alice', sprint: 9, reason: 'acquired' }]);
    el('menuLeaderboardBtn').click();
    await vi.waitFor(() => expect(el('menuLeaderboardList').children).toHaveLength(1));
    expect(el('menuLeaderboardEmpty').classList.contains('hidden')).toBe(true);
    expect(el('menuLeaderboardList').textContent).toContain('Alice');
    expect(el('menuLeaderboardList').textContent).toContain('Acquired');
  });

  it('shows the empty state when there are no entries yet', async () => {
    vi.spyOn(Game.Leaderboard, 'fetchLeaderboard').mockResolvedValue([]);
    el('menuLeaderboardBtn').click();
    await vi.waitFor(() => expect(el('menuLeaderboardEmpty').classList.contains('hidden')).toBe(false));
    expect(el('menuLeaderboardList').children).toHaveLength(0);
  });

  it('shows the Start Over button only while a run is actually paused, not on the fresh start screen', () => {
    expect(el('menuStartOverBtn').classList.contains('hidden')).toBe(true);
    Core.state = 'playing';
    Core.togglePause();
    expect(el('menuStartOverBtn').classList.contains('hidden')).toBe(false);
  });

  it('switches to and from the feedback panel like the other subpanels', () => {
    el('menuFeedbackBtn').click();
    expect(el('menuFeedbackPanel').classList.contains('hidden')).toBe(false);
    expect(el('menuMain').classList.contains('hidden')).toBe(true);
    el('feedbackBackBtn').click();
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuFeedbackPanel').classList.contains('hidden')).toBe(true);
  });

  it('resets the feedback textarea, counter, and any error every time the panel reopens', () => {
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'leftover draft';
    el('feedbackInput').dispatchEvent(new Event('input'));
    el('feedbackError').textContent = 'some old error';
    el('feedbackError').classList.remove('hidden');
    el('feedbackBackBtn').click();

    el('menuFeedbackBtn').click();
    expect(el('feedbackInput').value).toBe('');
    expect(el('feedbackCounter').textContent).toBe('0 / 500');
    expect(el('feedbackError').classList.contains('hidden')).toBe(true);
  });
});

describe('UI feedback submission', () => {
  it('updates the character counter live as the player types', () => {
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'hello';
    el('feedbackInput').dispatchEvent(new Event('input'));
    expect(el('feedbackCounter').textContent).toBe('5 / 500');
  });

  it('shows an inline error instead of submitting when the message is empty', () => {
    const spy = vi.spyOn(Game.Feedback, 'submitFeedback');
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = '   ';
    el('feedbackSubmitBtn').click();
    expect(spy).not.toHaveBeenCalled();
    expect(el('feedbackError').classList.contains('hidden')).toBe(false);
  });

  it('on success, clears the input and shows an inline confirmation (not just a toast that could render behind the menu)', async () => {
    vi.spyOn(Game.Feedback, 'submitFeedback').mockResolvedValue({ ok: true });
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'Great game!';
    el('feedbackSubmitBtn').click();
    await vi.waitFor(() => expect(el('feedbackSuccess').classList.contains('hidden')).toBe(false));
    expect(el('feedbackForm').classList.contains('hidden')).toBe(true);
    expect(el('feedbackSuccess').textContent).toMatch(/thanks/i);
    // Still on the feedback panel, inside the still-open menu screen — the
    // player explicitly dismisses via Done, nothing snaps them away.
    expect(el('menuFeedbackPanel').classList.contains('hidden')).toBe(false);
    expect(el('feedbackInput').value).toBe('');
  });

  it('the Done button on the success view returns to the main panel', async () => {
    vi.spyOn(Game.Feedback, 'submitFeedback').mockResolvedValue({ ok: true });
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'Great game!';
    el('feedbackSubmitBtn').click();
    await vi.waitFor(() => expect(el('feedbackSuccess').classList.contains('hidden')).toBe(false));
    el('feedbackDoneBtn').click();
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuFeedbackPanel').classList.contains('hidden')).toBe(true);
  });

  it('reopening the panel after a success shows the form again, not the leftover success view', async () => {
    vi.spyOn(Game.Feedback, 'submitFeedback').mockResolvedValue({ ok: true });
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'Great game!';
    el('feedbackSubmitBtn').click();
    await vi.waitFor(() => expect(el('feedbackSuccess').classList.contains('hidden')).toBe(false));
    el('feedbackDoneBtn').click();

    el('menuFeedbackBtn').click();
    expect(el('feedbackForm').classList.contains('hidden')).toBe(false);
    expect(el('feedbackSuccess').classList.contains('hidden')).toBe(true);
  });

  it('on a rate-limited response, shows that specific message and stays on the panel', async () => {
    vi.spyOn(Game.Feedback, 'submitFeedback').mockResolvedValue({ ok: false, reason: 'rate_limited' });
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'Great game!';
    el('feedbackSubmitBtn').click();
    await vi.waitFor(() => expect(el('feedbackError').classList.contains('hidden')).toBe(false));
    expect(el('feedbackError').textContent).toMatch(/already/i);
    expect(el('menuFeedbackPanel').classList.contains('hidden')).toBe(false);
  });

  it('on a too_long response, shows that specific message', async () => {
    vi.spyOn(Game.Feedback, 'submitFeedback').mockResolvedValue({ ok: false, reason: 'too_long' });
    el('menuFeedbackBtn').click();
    el('feedbackInput').value = 'Great game!';
    el('feedbackSubmitBtn').click();
    await vi.waitFor(() => expect(el('feedbackError').classList.contains('hidden')).toBe(false));
    expect(el('feedbackError').textContent).toMatch(/500 characters/);
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
    expect(el('menuPlayBtn').textContent).toBe('Resume');
    expect(el('menuStartOverBtn').classList.contains('hidden')).toBe(false);
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

  it('shows the severance cost on the fire button and enables it when affordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 999999;
    UI.updateUpgradePanel();
    const severance = Core.severanceCostFor(Core.towers[0]);
    expect(el('fireBtn').textContent).toBe(`Fire (${Game.fmt(severance)})`);
    expect(el('fireBtn').disabled).toBe(false);
  });

  it('disables the fire button when severance is unaffordable', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 0;
    UI.updateUpgradePanel();
    expect(el('fireBtn').disabled).toBe(true);
  });

  it('the fire button stays available even at the level cap, unlike the upgrade button', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.towers[0].level = CFG.MAX_TOWER_LEVEL;
    Core.selectedTower = Core.towers[0];
    Core.budget = 999999;
    UI.updateUpgradePanel();
    expect(el('fireBtn').disabled).toBe(false);
  });

  it('shows "Remove" (not "Fire") with no cost for the coffee machine, and is never disabled', () => {
    Core.budget = CFG.TOWER_TYPES.coffee.cost;
    Core.hireAt(CFG.COFFEE_SPOT.col, CFG.COFFEE_SPOT.row, 'coffee');
    Core.selectedTower = Core.towers[0];
    Core.budget = 0; // even broke, removal is free and always available
    UI.updateUpgradePanel();
    expect(el('fireBtn').textContent).toBe('Remove');
    expect(el('fireBtn').disabled).toBe(false);
  });
});

describe('UI.init wires the fire button', () => {
  it('clicking Fire fires the selected tower', () => {
    const d = CFG.DESK_POSITIONS[0];
    Core.hireAt(d.col, d.row, 'engineer');
    Core.selectedTower = Core.towers[0];
    Core.budget = 999999;
    UI.updateUpgradePanel();
    el('fireBtn').click();
    expect(Core.towers).toHaveLength(0);
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
    expect(el('screen-menu').classList.contains('hidden')).toBe(true);
  });

  it('hides every screen when passed null', () => {
    UI.showScreen(null);
    expect(el('screen-menu').classList.contains('hidden')).toBe(true);
    expect(el('screen-gameover').classList.contains('hidden')).toBe(true);
  });

  it('resets to the main panel every time the menu is reopened', () => {
    UI.showScreen('menu');
    UI.showMenuPanel('instructions');
    UI.showScreen(null);
    UI.showScreen('menu');
    expect(el('menuMain').classList.contains('hidden')).toBe(false);
    expect(el('menuInstructionsPanel').classList.contains('hidden')).toBe(true);
  });
});

describe('UI.showNameDialog / hideNameDialog', () => {
  it('shows the dialog with a rank-specific title, clears any previous input/error', () => {
    el('nameDialogInput').value = 'stale';
    el('nameDialogError').classList.remove('hidden');
    UI.showNameDialog(3);
    expect(el('nameDialog').classList.contains('hidden')).toBe(false);
    expect(el('nameDialogTitle').textContent).toContain('#3');
    expect(el('nameDialogInput').value).toBe('');
    expect(el('nameDialogError').classList.contains('hidden')).toBe(true);
  });

  it('falls back to a generic title when no rank is given', () => {
    UI.showNameDialog(null);
    expect(el('nameDialogTitle').textContent).toBe('You made the Top 10!');
  });

  it('hideNameDialog hides it', () => {
    UI.showNameDialog(1);
    UI.hideNameDialog();
    expect(el('nameDialog').classList.contains('hidden')).toBe(true);
  });
});

describe('the name dialog submit flow (via the real button click)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows an inline error and does not call the server for an empty name', () => {
    UI.showNameDialog(1);
    el('nameDialogInput').value = '   ';
    el('nameDialogSubmitBtn').click();
    expect(el('nameDialogError').classList.contains('hidden')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('on success, hides the dialog and refreshes the leaderboard list', async () => {
    fetch
      .mockReturnValueOnce(Promise.resolve({ json: () => Promise.resolve({ secret: 's1' }) })) // runStart
      .mockReturnValueOnce(Promise.resolve({ json: () => Promise.resolve({ ok: true, name: 'Alice' }) })) // submitName
      .mockReturnValueOnce(Promise.resolve({ json: () => Promise.resolve({ entries: [{ name: 'Alice', sprint: 5 }] }) })); // fetchLeaderboard
    await Game.Leaderboard.runStart(); // establishes a real leaderboard session directly (Core.start() doesn't await it)
    UI.showNameDialog(2);
    el('nameDialogInput').value = 'Alice';
    el('nameDialogSubmitBtn').click();
    await vi.waitFor(() => expect(el('nameDialog').classList.contains('hidden')).toBe(true));
    await vi.waitFor(() => expect(el('leaderboardList').children.length).toBe(1));
  });

  it('on rejection, shows a specific inline error and leaves the dialog open', async () => {
    fetch
      .mockReturnValueOnce(Promise.resolve({ json: () => Promise.resolve({ secret: 's1' }) })) // runStart
      .mockReturnValueOnce(Promise.resolve({ json: () => Promise.resolve({ ok: false, reason: 'profanity' }) })); // submitName
    await Game.Leaderboard.runStart();
    UI.showNameDialog(2);
    el('nameDialogInput').value = 'BadWord';
    el('nameDialogSubmitBtn').click();
    await vi.waitFor(() => expect(el('nameDialogError').classList.contains('hidden')).toBe(false));
    expect(el('nameDialog').classList.contains('hidden')).toBe(false);
  });

  it('pressing Enter in the input submits the same as clicking the button', () => {
    UI.showNameDialog(1);
    el('nameDialogInput').value = '';
    el('nameDialogInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el('nameDialogError').classList.contains('hidden')).toBe(false); // empty-name path, no fetch needed
  });
});

describe('UI.renderLeaderboard', () => {
  it('hides the section when there are no entries', () => {
    UI.renderLeaderboard([]);
    expect(el('leaderboardSection').classList.contains('hidden')).toBe(true);
  });

  it('hides the section when entries is null/undefined', () => {
    UI.renderLeaderboard(null);
    expect(el('leaderboardSection').classList.contains('hidden')).toBe(true);
  });

  it('renders one row per entry, ranked by list position, name set via textContent (not interpolated HTML)', () => {
    UI.renderLeaderboard([{ name: '<b>Alice</b>', sprint: 12 }, { name: 'Bob', sprint: 9 }]);
    const section = el('leaderboardSection');
    expect(section.classList.contains('hidden')).toBe(false);
    const rows = el('leaderboardList').querySelectorAll('.leaderboard-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.leaderboard-rank').textContent).toBe('1');
    expect(rows[0].querySelector('.leaderboard-name').textContent).toBe('<b>Alice</b>');
    expect(rows[0].querySelector('.leaderboard-name').querySelector('b')).toBeNull(); // proves textContent, not innerHTML
    expect(rows[1].querySelector('.leaderboard-sprint').textContent).toBe('Sprint 9');
  });

  it('shows an "Acquired" badge only on rows with that ending, not on every row', () => {
    UI.renderLeaderboard([
      { name: 'Alice', sprint: 12, reason: 'acquired' },
      { name: 'Bob', sprint: 9, reason: 'bankrupt' },
      { name: 'Carol', sprint: 7 } // no reason at all (older/pre-migration rows) — treated as not-acquired
    ]);
    const rows = el('leaderboardList').querySelectorAll('.leaderboard-row');
    expect(rows[0].querySelector('.leaderboard-badge').textContent).toBe('Acquired');
    expect(rows[1].querySelector('.leaderboard-badge')).toBeNull();
    expect(rows[2].querySelector('.leaderboard-badge')).toBeNull();
    // Sprint info stays visible either way — the badge adds to it, doesn't replace it.
    expect(rows[0].querySelector('.leaderboard-sprint').textContent).toBe('Sprint 12');
  });
});
