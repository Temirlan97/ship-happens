// DOM-side HUD, the desk hire-panel popup, upgrade panel, toasts,
// funding-round perk modal, and screen overlays.
(function () {
  const CFG = window.Game.Config;
  let core;
  let toastTimer = null;

  const el = (id) => document.getElementById(id);

  function init(coreRef) {
    core = coreRef;
    el('restartBtn').addEventListener('click', () => core.restart());
    el('nextSprintBtn').addEventListener('click', () => core.requestNextWave());
    el('pauseBtn').addEventListener('click', () => core.togglePause());
    el('muteBtn').addEventListener('click', () => core.toggleMute());
    el('speedBtn').addEventListener('click', () => core.cycleSpeed());
    el('upgradeBtn').addEventListener('click', (e) => { e.stopPropagation(); core.upgradeSelected(); });
    el('fireBtn').addEventListener('click', (e) => { e.stopPropagation(); core.fireSelectedTower(); });
    el('upgradePanel').addEventListener('pointerdown', (e) => e.stopPropagation());
    el('hirePanel').addEventListener('pointerdown', (e) => e.stopPropagation());
    el('menuPlayBtn').addEventListener('click', () => {
      if (core.state === 'paused') core.togglePause();
      else core.start();
    });
    el('menuInstructionsBtn').addEventListener('click', () => showMenuPanel('instructions'));
    el('menuLeaderboardBtn').addEventListener('click', () => showMenuPanel('leaderboard'));
    el('menuFeedbackBtn').addEventListener('click', () => showMenuPanel('feedback'));
    el('instructionsBackBtn').addEventListener('click', () => showMenuPanel('main'));
    el('leaderboardBackBtn').addEventListener('click', () => showMenuPanel('main'));
    el('feedbackBackBtn').addEventListener('click', () => showMenuPanel('main'));
    el('feedbackDoneBtn').addEventListener('click', () => showMenuPanel('main'));
    el('feedbackInput').addEventListener('input', () => updateFeedbackCounter());
    el('feedbackSubmitBtn').addEventListener('click', () => submitFeedback());
    el('menuStartOverBtn').addEventListener('click', () => {
      core.openConfirmDialog('Your current run will be lost — budget, hires, and progress all reset.', () => core.restart());
    });
    el('confirmCancelBtn').addEventListener('click', () => core.closeConfirmDialog(false));
    el('confirmOkBtn').addEventListener('click', () => core.closeConfirmDialog(true));
    el('confirmDialog').addEventListener('pointerdown', (e) => e.stopPropagation());
    el('nameDialogSkipBtn').addEventListener('click', () => hideNameDialog());
    el('nameDialogSubmitBtn').addEventListener('click', () => submitNameDialog());
    el('nameDialogInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitNameDialog(); });
    el('nameDialog').addEventListener('pointerdown', (e) => e.stopPropagation());
    el('acquisitionAcceptBtn').addEventListener('click', () => core.acceptAcquisition());
    el('acquisitionDeclineBtn').addEventListener('click', () => core.declineAcquisition());
    el('acquisitionDialog').addEventListener('pointerdown', (e) => e.stopPropagation());
    renderTimeline();
    showScreen('menu');
    updateHUD();
  }

  // The funding-round roadmap: a static track of stage dots built once, with
  // a fill bar and per-dot reached/current state refreshed every HUD tick so
  // players always know what's next and how far away it is.
  function renderTimeline() {
    const track = el('timelineTrack');
    track.innerHTML = '<div id="timelineFill"></div>';
    const maxSprint = CFG.FUNDING_STAGES[CFG.FUNDING_STAGES.length - 1].triggerSprint;
    CFG.FUNDING_STAGES.forEach((s) => {
      const pct = ((s.triggerSprint - 1) / (maxSprint - 1)) * 100;
      const dot = document.createElement('div');
      dot.className = 'timeline-stage';
      dot.style.top = pct + '%';
      dot.dataset.key = s.key;
      dot.innerHTML = '<span class="timeline-dot"></span><span class="timeline-label">' + s.name + '</span>';
      track.appendChild(dot);
    });
  }

  function updateTimeline() {
    if (!core) return;
    const w = core.waves;
    const maxSprint = CFG.FUNDING_STAGES[CFG.FUNDING_STAGES.length - 1].triggerSprint;
    const cur = Math.min(Math.max(0, w.displayWaveNumber), maxSprint);
    const pct = ((cur - 1) / (maxSprint - 1)) * 100;
    const fill = el('timelineFill');
    if (fill) fill.style.height = Math.max(0, pct) + '%';
    document.querySelectorAll('.timeline-stage').forEach((dot) => {
      const stage = CFG.FUNDING_STAGES.find((s) => s.key === dot.dataset.key);
      dot.classList.toggle('reached', w.displayWaveNumber >= stage.triggerSprint);
      dot.classList.toggle('current', w.stage.key === stage.key);
    });
    const nextStage = CFG.FUNDING_STAGES[w.stageIndex + 1] || null;
    const remaining = nextStage ? nextStage.triggerSprint - w.displayWaveNumber : 0;
    el('timelineNext').textContent = nextStage
      ? `Next: ${nextStage.name} in ${remaining} sprint${remaining === 1 ? '' : 's'}`
      : 'Scale-Up — this is the endless grind now';
  }

  // The popup that opens when an empty desk (or the coffee spot) is
  // clicked — one card per offered role. Desks offer every human role;
  // the coffee spot offers just itself (`roles` param), so it gets the
  // exact same confirm-before-hiring UI instead of hiring instantly.
  // Reuses the same `.card` styling the old toolbar used, just as a
  // floating popup instead of a docked bar.
  function showHirePanel(desk, roles) {
    const panel = el('hirePanel');
    if (!desk || !core) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    const keys = roles || Object.keys(CFG.TOWER_TYPES).filter((k) => k !== 'coffee');

    panel.innerHTML = '';
    keys.forEach((key) => {
      const def = CFG.TOWER_TYPES[key];
      const s = core.getCardState(key);
      const btn = document.createElement('button');
      btn.dataset.type = key;
      btn.className = cardClassFor(s);
      btn.disabled = s.roleLocked || s.locked || !s.affordable;
      const lockHtml = s.roleLocked
        ? `<div class="card-lock"><span class="lock-label">Locked</span></div>`
        : '';
      btn.innerHTML = `
        <div class="card-cooldown"></div>
        ${lockHtml}
        <div class="card-icon"></div>
        <div class="card-name">${def.name}</div>
        <div class="card-cost">${window.Game.fmt(s.cost)}</div>
      `;
      // Set via the CSSOM (not an inline style="" attribute) so this stays
      // compatible with the site's style-src 'self' CSP — inline style
      // attributes are blocked by CSP, direct .style property writes aren't.
      btn.querySelector('.card-cooldown').style.height = (s.roleLocked ? 0 : s.cooldownFraction * 100) + '%';
      btn.querySelector('.card-icon').style.backgroundImage = `url('assets/characters/${key}.png')`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); core.hireAt(desk.col, desk.row, key); });
      panel.appendChild(btn);
    });

    panel.classList.remove('hidden');
    const canvas = document.getElementById('gameCanvas');
    const c = window.Game.Path.cellCenter(desk.col, desk.row);
    const screenPt = window.Game.Camera.worldToScreen(c.x, c.y);
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    panel.style.left = (canvas.offsetLeft + screenPt.x * scaleX) + 'px';
    panel.style.top = (canvas.offsetTop + screenPt.y * scaleY - 20) + 'px'; // CSS translate(-50%,-100%) anchors the panel above this point
  }

  function cardClassFor(s) {
    let cls = 'card hire-option';
    if (s.roleLocked) cls += ' role-locked';
    else if (s.locked || !s.affordable) cls += ' disabled';
    return cls;
  }

  // Called every frame while a hire panel is open (see game.js's loop) so the
  // per-role cooldown shade actually counts down live instead of being
  // frozen at whatever it read the instant the panel opened, and so a role
  // un-grays the moment it becomes affordable/off-cooldown without the
  // player having to close and reopen the panel.
  function refreshHirePanel() {
    const panel = el('hirePanel');
    if (panel.classList.contains('hidden') || !core) return;
    panel.querySelectorAll('.hire-option').forEach((btn) => {
      const s = core.getCardState(btn.dataset.type);
      btn.className = cardClassFor(s);
      btn.disabled = s.roleLocked || s.locked || !s.affordable;
      const bar = btn.querySelector('.card-cooldown');
      if (bar) bar.style.height = (s.roleLocked ? 0 : s.cooldownFraction * 100) + '%';
    });
  }

  function updateHUD() {
    if (!core) return;
    el('budgetValue').textContent = window.Game.fmt(core.budget);
    el('budgetValue').classList.toggle('negative', core.budget < 0);
    el('payrollValue').textContent = window.Game.fmt(core.projectedPayroll);
    el('bestSprintValue').textContent = core.bestSprint;

    const w = core.waves;
    el('stageLabel').textContent = w.stage.name;
    if (w.tier === 0) el('sprintValue').textContent = `${Math.max(0, w.displayWaveNumber)} / ${CFG.CAMPAIGN_SPRINTS}`;
    else el('sprintValue').textContent = `${w.displayWaveNumber} · Scale-Up`;

    // Only relevant between sprints — while one is active there's nothing to
    // count down to, and the card was otherwise just sitting there partially
    // covering the map on small screens for no reason.
    const banner = el('countdownBanner');
    if (w.active) {
      banner.classList.add('hidden');
      el('nextSprintBtn').classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
      const secs = Math.ceil(w.betweenTimer);
      el('countdownValue').textContent = `${secs}s`;
      el('nextSprintBtn').classList.remove('hidden');
      banner.classList.toggle('urgent', secs <= 3);
    }

    const warn = el('paydayWarning');
    if (core.negativeBudgetTimer > 0) {
      warn.textContent = `OUT OF MONEY — recover in ${Math.ceil(core.negativeBudgetTimer)}s or the company folds`;
      warn.classList.remove('hidden');
      warn.classList.add('crisis');
    } else {
      warn.classList.remove('crisis');
      const projected = core.projectedPayroll;
      if (!w.active && w.waveIndex >= 0 && core.budget - projected < 0) {
        warn.textContent = `WARNING: Next payday -${window.Game.fmt(projected)} Budget — you'll be out of money`;
        warn.classList.remove('hidden');
      } else {
        warn.classList.add('hidden');
      }
    }

    el('pauseBtn').textContent = core.state === 'paused' ? 'Resume' : 'Pause';
    el('menuPlayBtn').textContent = core.state === 'paused' ? 'Resume' : 'Play';
    el('menuStartOverBtn').classList.toggle('hidden', core.state !== 'paused');
    el('muteBtn').textContent = core.muted ? 'Sound: Off' : 'Sound: On';
    el('speedValue').textContent = core.speed + 'x';
    el('speedBtn').classList.toggle('active', core.speed > 1);

    if (core.state === 'gameover') {
      const acquired = core.gameOverReason === 'acquired';
      el('gameoverTitle').textContent = acquired ? 'Acquired!' : 'Ran Out of Money';
      el('acquisitionPriceBanner').classList.toggle('hidden', !acquired);
      if (acquired) el('statAcquisitionPrice').textContent = window.Game.fmt(core.pendingAcquisitionPrice);
      const s = core.stats;
      el('statSprintValue').textContent = core.lastReachedSprint || 1;
      el('statBestValue').textContent = core.bestSprint;
      el('statIncome').textContent = window.Game.fmt(s.income);
      el('statSalaries').textContent = window.Game.fmt(s.salaries);
      el('statLost').textContent = window.Game.fmt(s.lost);
      el('statKills').textContent = s.kills;
    }
    updateTimeline();
  }

  // Minimal by design: the tower's current rank/level is already drawn right
  // on the canvas below it (see Tower.draw in entities.js), so this panel's
  // only job is to show what promoting gets you — a preview of the next
  // rank's art plus its name and cost, not a wall of stats.
  function updateUpgradePanel() {
    const panel = el('upgradePanel');
    const tower = core && core.selectedTower;
    if (!tower) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const def = tower.def;
    const preview = el('upPreview');
    const nameEl = el('upNextName');
    const btn = el('upgradeBtn');
    const maxed = el('upMaxed');

    // The one exception to "minimal text": an aura buff isn't visible in a
    // static preview image the way combat stats are implied by a role, so
    // it gets a one-line reminder of what it actually does.
    const auraNote = el('upAuraNote');
    auraNote.classList.toggle('hidden', def.attack !== 'aura');

    if (tower.canUpgrade()) {
      const nextLevel = tower.level + 1;
      preview.style.backgroundImage = `url('assets/characters/${tower.type}_${nextLevel}.png')`;
      preview.style.borderColor = def.glow;
      nameEl.textContent = def.ranks[tower.level];
      maxed.classList.add('hidden');
      const cost = tower.upgradeCost();
      btn.textContent = window.Game.fmt(cost);
      btn.disabled = core.budget < cost;
      btn.classList.remove('hidden');
    } else {
      preview.style.backgroundImage = `url('assets/characters/${tower.type}_${tower.level}.png')`;
      preview.style.borderColor = def.glow;
      nameEl.textContent = def.ranks[tower.level - 1];
      maxed.classList.remove('hidden');
      btn.classList.add('hidden');
    }

    // Firing is always available regardless of upgrade state — a maxed-out
    // teammate can still be let go, same as a fresh hire. The coffee machine
    // isn't a person, so it's just unplugged — no severance, different label.
    const severance = core.severanceCostFor(tower);
    const fireBtn = el('fireBtn');
    if (tower.type === 'coffee') {
      fireBtn.textContent = 'Remove';
      fireBtn.disabled = false;
    } else {
      fireBtn.textContent = `Fire (${window.Game.fmt(severance)})`;
      fireBtn.disabled = core.budget < severance;
    }
  }

  // Anchored above the tower's head (not centered on it) so promoting never
  // requires hiding the character to see the panel — see the .upgrade-panel
  // CSS comment for the bottom-anchored transform this offset relies on.
  // Clamped to stay fully on-screen for desks near a viewport edge (e.g. the
  // top row, where the naive offset would push the panel above y=0).
  function positionUpgradePanel(tower, canvas) {
    const panel = el('upgradePanel');
    if (panel.classList.contains('hidden')) return;
    const screenPt = window.Game.Camera.worldToScreen(tower.x, tower.y);
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const halfW = panel.offsetWidth / 2;
    const h = panel.offsetHeight;
    let left = canvas.offsetLeft + screenPt.x * scaleX;
    let top = canvas.offsetTop + screenPt.y * scaleY - 130;
    left = Math.min(Math.max(left, halfW + 8), canvas.offsetLeft + canvas.clientWidth - halfW - 8);
    top = Math.max(top, h + 8);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.classList.add('hidden'), 400);
    }, 4200);
  }

  function showScreen(name) {
    ['menu', 'gameover'].forEach((n) => {
      const screen = el('screen-' + n);
      if (screen) screen.classList.toggle('hidden', n !== name);
    });
    // Every fresh open of the menu (game start, a new pause) should land on
    // the main panel — not wherever the player last navigated to before it
    // was hidden.
    if (name === 'menu') showMenuPanel('main');
  }

  // Which of the menu's four panels is showing — pure presentation state,
  // not part of Core.state (pausing/starting doesn't care which one the
  // player is looking at).
  function showMenuPanel(name) {
    el('menuMain').classList.toggle('hidden', name !== 'main');
    el('menuInstructionsPanel').classList.toggle('hidden', name !== 'instructions');
    el('menuLeaderboardPanel').classList.toggle('hidden', name !== 'leaderboard');
    el('menuFeedbackPanel').classList.toggle('hidden', name !== 'feedback');
    if (name === 'leaderboard') showMenuLeaderboard();
    if (name === 'feedback') resetFeedbackPanel();
  }

  // Every fresh open should start from a clean slate — a previous
  // submission's text/error/success state shouldn't linger for the next visit.
  function resetFeedbackPanel() {
    el('feedbackInput').value = '';
    el('feedbackError').classList.add('hidden');
    el('feedbackForm').classList.remove('hidden');
    el('feedbackSuccess').classList.add('hidden');
    updateFeedbackCounter();
  }

  function updateFeedbackCounter() {
    const len = el('feedbackInput').value.length;
    el('feedbackCounter').textContent = `${len} / 500`;
  }

  function feedbackErrorMessage(reason) {
    switch (reason) {
      case 'too_long': return 'Keep it under 500 characters.';
      case 'rate_limited': return "You've sent a few already — try again in a bit.";
      case 'empty': return 'Write something first.';
      default: return "Couldn't send that — try again.";
    }
  }

  function submitFeedback() {
    const message = el('feedbackInput').value.trim();
    const errorEl = el('feedbackError');
    if (!message) { errorEl.textContent = feedbackErrorMessage('empty'); errorEl.classList.remove('hidden'); return; }
    window.Game.Feedback.submitFeedback(message).then((res) => {
      if (res && res.ok) {
        el('feedbackInput').value = '';
        updateFeedbackCounter();
        // An explicit inline confirmation, not just a toast — a toast alone
        // was easy to miss (and, until the z-index fix above, was actually
        // rendering invisibly behind the still-open menu screen).
        el('feedbackForm').classList.add('hidden');
        el('feedbackSuccess').classList.remove('hidden');
      } else {
        errorEl.textContent = feedbackErrorMessage(res && res.reason);
        errorEl.classList.remove('hidden');
      }
    });
  }

  // Fetched fresh every time the panel opens (not just after a run ends,
  // unlike the gameover screen's leaderboard) so it's always current.
  function showMenuLeaderboard() {
    window.Game.Leaderboard.fetchLeaderboard().then((entries) => {
      const empty = el('menuLeaderboardEmpty');
      if (!entries || entries.length === 0) {
        el('menuLeaderboardList').innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');
      renderLeaderboardRows(el('menuLeaderboardList'), entries);
    });
  }

  function showConfirmDialog(message) {
    el('confirmMessage').textContent = message;
    el('confirmDialog').classList.remove('hidden');
  }
  function hideConfirmDialog() {
    el('confirmDialog').classList.add('hidden');
  }

  function showNameDialog(rank) {
    el('nameDialogTitle').textContent = rank ? `You're #${rank} on the leaderboard!` : 'You made the Top 10!';
    el('nameDialogInput').value = '';
    el('nameDialogError').classList.add('hidden');
    el('nameDialog').classList.remove('hidden');
    el('nameDialogInput').focus();
  }
  function hideNameDialog() {
    el('nameDialog').classList.add('hidden');
  }
  function submitNameDialog() {
    const name = el('nameDialogInput').value.trim();
    const errorEl = el('nameDialogError');
    if (!name) { errorEl.textContent = 'Enter a name first.'; errorEl.classList.remove('hidden'); return; }
    core.submitLeaderboardName(name).then((res) => {
      if (!res || !res.ok) {
        errorEl.textContent = nameErrorMessage(res && res.reason);
        errorEl.classList.remove('hidden');
      }
    });
  }
  function nameErrorMessage(reason) {
    switch (reason) {
      case 'profanity': return "That name isn't allowed — try something else.";
      case 'url_or_handle': return "Names can't include links or handles.";
      case 'too_long': return 'Keep it under 20 characters.';
      default: return "Couldn't submit that name — try again.";
    }
  }

  // Renders the top-10 board on the game-over stats card. `myRank`/`mine`
  // aren't part of the API response — the row is matched by name only
  // (best-effort highlight, not a security-sensitive distinction).
  // Shared between the gameover screen's leaderboard and the menu's —
  // identical row markup, two different list elements/trigger points.
  function renderLeaderboardRows(listEl, entries) {
    listEl.innerHTML = '';
    entries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row';
      // Only the (rarer, more notable) acquired outcome gets a badge — a
      // bankrupt ending is the default/expected one and doesn't need its
      // own label on every single row, so most rows stay exactly as before.
      const acquiredBadge = entry.reason === 'acquired' ? '<span class="leaderboard-badge">Acquired</span>' : '';
      li.innerHTML = `
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-name"></span>
        ${acquiredBadge}
        <span class="leaderboard-sprint">Sprint ${entry.sprint}</span>
      `;
      li.querySelector('.leaderboard-name').textContent = entry.name;
      listEl.appendChild(li);
    });
  }

  function renderLeaderboard(entries) {
    const section = el('leaderboardSection');
    if (!entries || entries.length === 0) { section.classList.add('hidden'); return; }
    renderLeaderboardRows(el('leaderboardList'), entries);
    section.classList.remove('hidden');
  }

  function showAcquisitionDialog() {
    el('acquisitionMessage').textContent =
      `You've grown Ship Happens to ${window.Game.fmt(core.budget)}. A buyer wants to acquire the whole ` +
      `company for ${window.Game.fmt(core.pendingAcquisitionPrice)}. Selling ends the game right here — ` +
      `keep playing, or cash out for good?`;
    el('acquisitionDialog').classList.remove('hidden');
  }
  function hideAcquisitionDialog() {
    el('acquisitionDialog').classList.add('hidden');
  }

  window.Game.UI = {
    init, updateHUD, showScreen, showMenuPanel,
    updateUpgradePanel, positionUpgradePanel, showToast,
    renderTimeline, updateTimeline, showHirePanel, refreshHirePanel,
    showConfirmDialog, hideConfirmDialog,
    showNameDialog, hideNameDialog, renderLeaderboard,
    showAcquisitionDialog, hideAcquisitionDialog
  };
})();
