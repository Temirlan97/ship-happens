// Game state machine + main loop: input, payroll/economy, funding-round
// progression, perk choices, desk-based hiring, and the endless Scale-Up
// flow. This is the file that carries the "feels like running a startup,
// not a fantasy TD" systems — see the integration-order comment on
// Core.update for why the steps are ordered the way they are.
(function () {
  const CFG = window.Game.Config;
  const PATH = window.Game.Path;
  const { Enemy, Tower, strokeGlowPath } = window.Game.Entities;
  const { WaveManager } = window.Game.Waves;

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // The world's own pixel layout is fixed forever at this one reference
  // size (matches every direct PATH.relayout(1600,1000) call in the test
  // suite, so the default desktop look is unchanged) — only the camera
  // adapts to whatever real viewport/zoom/pan the player has from here on.
  PATH.init(1600, 1000);
  window.Game.Camera.init(canvas.width, canvas.height, PATH.BOARD_W, PATH.BOARD_H);

  function loadBestSprint() {
    try { return parseInt(localStorage.getItem('ship_happens_best_sprint') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBestSprint(n) {
    try { localStorage.setItem('ship_happens_best_sprint', String(n)); } catch (e) { /* file:// storage can be unavailable */ }
  }
  const Core = {
    state: 'start', // start | playing | paused | gameover
    budget: CFG.START_BUDGET,
    enemies: [], towers: [], projectiles: [], particles: [], effects: [],
    selectedTower: null,
    pendingHireDesk: null, // {col,row} of an empty desk awaiting a role pick
    hoverTarget: null, // whatever hitTest() last found under the pointer — drives cursor + hover highlight
    cardCooldowns: {},
    lastTs: 0,
    muted: false,
    speed: 1,
    waves: new WaveManager(),
    shakeTimer: 0,
    bestSprint: loadBestSprint(),
    lastReachedSprint: 1,
    // Cumulative totals for the end-of-run stats card — every source of
    // Budget gain/loss during a run feeds exactly one of these, so the card
    // adds up to a real receipt of the run rather than a vibes-based summary.
    stats: { income: 0, salaries: 0, lost: 0, kills: 0 },
    // Seconds remaining to claw Budget back above zero before the run ends —
    // 0 means "not currently in the red." Set the moment Budget dips below
    // zero, cleared the moment it recovers; see the check at the end of update().
    negativeBudgetTimer: 0,
    autoPausedByVisibility: false,
    // Confirmation-dialog bookkeeping — see openConfirmDialog/closeConfirmDialog.
    pendingConfirmAction: null,
    dialogResumeToPlaying: false,
    // Advances only inside update() (which only runs while state==='playing'),
    // so every decorative animation that reads this instead of
    // performance.now() freezes exactly where it was when paused.
    gameTime: 0,

    init() {
      Object.keys(CFG.TOWER_TYPES).forEach(t => (this.cardCooldowns[t] = 0));
      this.bindInput();
      window.Game.UI.init(this);
      requestAnimationFrame(this.loop.bind(this));
    },

    bindInput() {
      const Camera = window.Game.Camera;
      // World-space (post-camera) coords — hitTest/screenToCell keep
      // operating in world-pixel space exactly as before this file gained
      // a camera at all.
      const toCanvasXY = (e) => {
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        return Camera.screenToWorld(sx, sy);
      };
      // Screen-space (pre-camera) coords — only used for gesture bookkeeping
      // (drag-distance thresholds, pinch distance/midpoint, wheel anchor),
      // never fed into hitTest.
      const toScreenXY = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
      };

      const runTap = (x, y) => {
        const hit = this.hitTest(x, y);

        if (hit && hit.type === 'tower') {
          this.pendingHireDesk = null;
          window.Game.UI.showHirePanel(null);
          this.selectedTower = hit.tower;
          window.Game.UI.updateUpgradePanel();
          return;
        }

        if (hit && hit.type === 'coffee') {
          this.selectedTower = null; window.Game.UI.updateUpgradePanel();
          this.pendingHireDesk = CFG.COFFEE_SPOT;
          window.Game.UI.showHirePanel(CFG.COFFEE_SPOT, ['coffee']);
          return;
        }

        if (hit && hit.type === 'desk') {
          this.selectedTower = null; window.Game.UI.updateUpgradePanel();
          this.pendingHireDesk = hit.desk;
          window.Game.UI.showHirePanel(hit.desk);
          return;
        }

        this.selectedTower = null; window.Game.UI.updateUpgradePanel();
        this.pendingHireDesk = null; window.Game.UI.showHirePanel(null);
      };

      // A tap must survive a real down-then-up with (near-)zero movement in
      // between, or it's a drag-to-pan instead — see pointermove/pointerup.
      const DRAG_THRESHOLD = 8; // screen px
      const activePointers = new Map(); // pointerId -> {startX,startY,lastX,lastY,moved}
      let pinchStartDist = null;

      canvas.addEventListener('pointerdown', (e) => {
        if (this.state !== 'playing') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return; // left-click/touch/pen only
        const s = toScreenXY(e);
        activePointers.set(e.pointerId, { startX: s.x, startY: s.y, lastX: s.x, lastY: s.y, moved: false });
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        if (activePointers.size === 2) {
          const [a, b] = [...activePointers.values()];
          pinchStartDist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
        }
      });

      canvas.addEventListener('pointermove', (e) => {
        if (this.state !== 'playing') { this.hoverTarget = null; canvas.style.cursor = 'default'; return; }

        const p = activePointers.get(e.pointerId);
        if (!p) {
          // No button/touch down — plain hover, unchanged from before.
          const { x, y } = toCanvasXY(e);
          const hit = this.hitTest(x, y);
          this.hoverTarget = hit;
          canvas.style.cursor = hit ? 'pointer' : 'default';
          return;
        }

        const s = toScreenXY(e);

        if (activePointers.size >= 2) {
          // Pinch: distance-based zoom around the pinch midpoint, plus pan
          // by however much that midpoint itself drifted (two-finger pan).
          p.moved = true;
          this.hoverTarget = null;
          const [[idA, a], [idB, b]] = [...activePointers.entries()];
          const other = e.pointerId === idA ? b : a;
          const midBeforeX = (p.lastX + other.lastX) / 2, midBeforeY = (p.lastY + other.lastY) / 2;
          p.lastX = s.x; p.lastY = s.y;
          const midAfterX = (p.lastX + other.lastX) / 2, midAfterY = (p.lastY + other.lastY) / 2;
          const dist = Math.hypot(p.lastX - other.lastX, p.lastY - other.lastY);
          if (pinchStartDist) {
            Camera.zoomAround(dist / pinchStartDist, midAfterX, midAfterY);
            pinchStartDist = dist;
          }
          Camera.panBy(midAfterX - midBeforeX, midAfterY - midBeforeY);
          return;
        }

        // Single pointer: drag-vs-tap disambiguation.
        const dx = s.x - p.lastX, dy = s.y - p.lastY;
        if (!p.moved && Math.hypot(s.x - p.startX, s.y - p.startY) > DRAG_THRESHOLD) {
          p.moved = true;
          this.hoverTarget = null;
        }
        p.lastX = s.x; p.lastY = s.y;
        if (p.moved) Camera.panBy(dx, dy);
      });

      const endPointer = (e, allowTap) => {
        const p = activePointers.get(e.pointerId);
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) pinchStartDist = null;
        if (allowTap && p && !p.moved && this.state === 'playing') {
          const { x, y } = toCanvasXY(e);
          runTap(x, y);
        }
      };
      canvas.addEventListener('pointerup', (e) => endPointer(e, true));
      canvas.addEventListener('pointercancel', (e) => endPointer(e, false));

      canvas.addEventListener('pointerleave', () => {
        this.hoverTarget = null;
        canvas.style.cursor = 'default';
      });

      canvas.addEventListener('wheel', (e) => {
        if (this.state !== 'playing') return;
        e.preventDefault();
        const s = toScreenXY(e);
        Camera.zoomAround(Math.pow(1.0015, -e.deltaY), s.x, s.y);
      }, { passive: false });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.selectedTower = null;
          this.pendingHireDesk = null;
          window.Game.UI.updateUpgradePanel();
          window.Game.UI.showHirePanel(null);
        }
      });

      // requestAnimationFrame is throttled/suspended for hidden tabs by every
      // browser, so the sim would otherwise just silently freeze mid-frame.
      // Pause explicitly instead, and surface why once the player is back
      // looking at the tab — a payday or incident landing while you weren't
      // watching would otherwise feel like it came out of nowhere.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.state === 'playing') {
            this.state = 'paused';
            this.autoPausedByVisibility = true;
            window.Game.UI.updateHUD();
          }
        } else if (this.autoPausedByVisibility) {
          this.autoPausedByVisibility = false;
          window.Game.UI.showToast('Paused while the tab was inactive — hit Resume to keep going.');
        }
      });

      // The board is sized to the viewport; keep it that way live. Debounced
      // since resize fires continuously while dragging a window edge.
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.handleResize(), 200);
      });

      // A run in progress is real, unsaved state (budget, hires, sprint
      // progress) — closing the tab loses all of it, so confirm first.
      // Browsers ignore any custom message these days and just show their
      // own generic prompt; setting returnValue is still what triggers it.
      window.addEventListener('beforeunload', (e) => {
        if (this.state !== 'playing') return;
        e.preventDefault();
        e.returnValue = '';
      });
    },

    // The world's pixel layout is fixed forever (see PATH.init at boot) —
    // resizing only ever needs to resize the canvas backing store and let
    // the camera re-clamp to the new viewport. Towers/enemies never move
    // (their world coordinates didn't change), so there's nothing to
    // re-derive here anymore. Still closes any open desk/upgrade popup
    // since its on-screen anchor just moved.
    handleResize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      window.Game.Camera.onResize(canvas.width, canvas.height);
      this.selectedTower = null; window.Game.UI.updateUpgradePanel();
      this.pendingHireDesk = null; window.Game.UI.showHirePanel(null);
    },

    // ---- roles / hiring ----
    roleUnlocked(type) {
      const def = CFG.TOWER_TYPES[type];
      if (!def.unlockRequiresStage) return true;
      const requiredIdx = CFG.FUNDING_STAGES.findIndex(s => s.key === def.unlockRequiresStage);
      return this.waves.stageIndex >= requiredIdx;
    },

    hireCostFor(type) {
      return CFG.TOWER_TYPES[type].cost;
    },

    getCardState(type) {
      const def = CFG.TOWER_TYPES[type];
      const cd = this.cardCooldowns[type] || 0;
      const cost = this.hireCostFor(type);
      return {
        roleLocked: !this.roleUnlocked(type),
        locked: cd > 0,
        cooldownFraction: Math.min(1, cd / def.cooldown),
        affordable: this.budget >= cost,
        cost
      };
    },

    towerAt(col, row) {
      return this.towers.find(t => t.col === col && t.row === row) || null;
    },

    // Single source of truth for "what's under this screen point" — shared
    // by click handling and hover tracking so the cursor/highlight always
    // agree exactly with what a click would do. Precedence: an existing
    // tower (own hit radius, then falling back to desk-cell occupancy for
    // clicks that land near a tile edge) beats the empty coffee spot, which
    // beats an empty desk.
    hitTest(x, y) {
      const zoom = window.Game.Camera.zoom;
      // Character/desk/coffee sprites are drawn tall and anchored at their
      // FEET (near the tile's own ground point), extending far upward from
      // there (~80-96px) — a hit test centered on the ground point alone
      // badly undershoots the visible sprite, especially near the head/top,
      // which is exactly where people intuitively click. An ellipse offset
      // upward toward the sprite's visual center, taller than it is wide,
      // matches what's actually on screen far better than a small centered
      // circle did. Kept in constant SCREEN space (divided by zoom) so it
      // doesn't shrink to unusable once the camera zooms out on a phone.
      const RX = 32 / zoom, RY = 55 / zoom, LIFT = 30 / zoom;
      const inSpriteHitbox = (cx, cy) => {
        const dx = (x - cx) / RX, dy = (y - (cy - LIFT)) / RY;
        return dx * dx + dy * dy < 1;
      };

      const hitTower = this.towers.find(t => inSpriteHitbox(t.x, t.y));
      if (hitTower) return { type: 'tower', tower: hitTower };

      // Same generous hitbox for empty desks/coffee spot — their sprites are
      // just as tall, checked before falling back to strict tile membership.
      for (const d of CFG.DESK_POSITIONS) {
        if (this.towerAt(d.col, d.row)) continue;
        const c = PATH.cellCenter(d.col, d.row);
        if (inSpriteHitbox(c.x, c.y)) return { type: 'desk', desk: d };
      }
      const cs = CFG.COFFEE_SPOT;
      if (!this.towerAt(cs.col, cs.row)) {
        const cc = PATH.cellCenter(cs.col, cs.row);
        if (inSpriteHitbox(cc.x, cc.y)) return { type: 'coffee' };
      }

      // Fallback: strict tile membership, for clicks the generous hitbox
      // above doesn't cover (e.g. the wide lower corners of a tile diamond).
      const cell = PATH.screenToCell(x, y);
      const occupied = this.towerAt(cell.col, cell.row);
      if (occupied) return { type: 'tower', tower: occupied };

      if (cell.col === cs.col && cell.row === cs.row) return { type: 'coffee' };

      const desk = CFG.DESK_POSITIONS.find(d => d.col === cell.col && d.row === cell.row);
      return desk ? { type: 'desk', desk } : null;
    },

    // Hires `type` at a specific desk (col,row) — desks are pre-placed valid
    // spots, so unlike the old free-placement flow there's no buildable
    // check needed here. The occupancy check IS still needed: the caller is
    // expected to only ever offer this for an empty desk, but this is the
    // one check that must hold regardless of caller, since two teammates
    // sharing a cell means they render stacked on top of each other.
    hireAt(col, row, type) {
      const def = CFG.TOWER_TYPES[type];
      if (!def || this.towerAt(col, row)) return;
      const s = this.getCardState(type);
      if (s.roleLocked || s.locked || !s.affordable) { window.Game.Audio.error(); return; }
      const center = PATH.cellCenter(col, row);
      this.budget -= s.cost;
      this.cardCooldowns[type] = def.cooldown;
      this.towers.push(new Tower(type, col, row, center));
      window.Game.Audio.place();
      this.spawnParticles(center.x, center.y, def.glow, 10, 70);
      this.pendingHireDesk = null;
      window.Game.UI.showHirePanel(null);
      if (type === 'coffee') {
        window.Game.UI.showToast(`${def.name} hired — boosts every teammate's damage and fire rate company-wide.`);
      }
    },

    upgradeSelected() {
      const tower = this.selectedTower;
      if (!tower || !tower.canUpgrade()) return;
      const cost = tower.upgradeCost();
      if (this.budget < cost) { window.Game.Audio.error(); return; }
      this.budget -= cost;
      tower.upgrade();
      window.Game.Audio.promote();
      this.spawnParticles(tower.x, tower.y - 20, tower.def.glow, 16, 90);
      window.Game.UI.updateUpgradePanel();
    },

    // Firing costs severance up front — a real budget hit, not a free undo
    // of a hire — scaled off the tower's own current (rank-scaled) salary,
    // so letting go of someone senior costs more than a junior. Frees their
    // desk immediately, same as it was before they were ever hired.
    // The coffee machine isn't a person on payroll — it's unplugged for
    // free, not given a severance package.
    severanceCostFor(tower) {
      if (tower.type === 'coffee') return 0;
      return Math.round(tower.salary * CFG.SEVERANCE_SALARY_MULT);
    },
    fireSelectedTower() {
      const tower = this.selectedTower;
      if (!tower) return;
      const severance = this.severanceCostFor(tower);
      if (this.budget < severance) { window.Game.Audio.error(); return; }
      this.budget -= severance;
      this.stats.salaries += severance;
      this.towers = this.towers.filter(t => t !== tower);
      this.selectedTower = null;
      window.Game.Audio.payday();
      this.spawnParticles(tower.x, tower.y - 10, '#ff6b6b', 10, 70);
      if (severance > 0) {
        this.effects.push({ type: 'floatText', x: tower.x, y: tower.y - 50, life: 1.1, maxLife: 1.1, text: '-' + window.Game.fmt(severance), color: '#ff6b6b' });
      }
      window.Game.UI.updateUpgradePanel();
      const message = tower.type === 'coffee'
        ? `${tower.def.name} removed.`
        : `${tower.def.name} let go — ${window.Game.fmt(severance)} severance paid.`;
      window.Game.UI.showToast(message);
    },

    cycleSpeed() {
      this.speed = this.speed === 1 ? 2 : (this.speed === 2 ? 3 : (this.speed === 3 ? 4 : 1));
      window.Game.UI.updateHUD();
    },

    // ---- coffee machine boost: company-wide (every hired teammate, no
    // matter where they sit), not radius-limited — read live (not cached)
    // so there's no staleness to manage ----
    auraDmgMultFor() {
      let best = 1;
      for (const src of this.towers) {
        if (src.type !== 'coffee' || src.stunTimer > 0) continue;
        best = Math.max(best, src.auraDmgMultValue);
      }
      return best;
    },
    auraRateMultFor() {
      let best = 1;
      for (const src of this.towers) {
        if (src.type !== 'coffee' || src.stunTimer > 0) continue;
        best = Math.min(best, src.auraRateMultValue);
      }
      return best;
    },

    // ---- economy ----
    addBudget(amount, x, y) {
      this.budget += amount;
      this.stats.income += amount;
      window.Game.Audio.budgetGain();
      if (x !== undefined) this.spawnParticles(x, y, '#f2c94c', 6, 50);
    },
    stealBudget(pct) {
      const lost = Math.round(this.budget * pct);
      this.budget = Math.max(0, this.budget - lost);
      this.stats.lost += lost;
      window.Game.Audio.budgetStolen();
    },
    // The coffee machine isn't a teammate an incident can pull away to
    // firefight — it's excluded from the stun pool entirely.
    stunRandomTeammate(ms) {
      const eligible = this.towers.filter(t => t.type !== 'coffee');
      if (!eligible.length) return;
      const v = eligible[Math.floor(Math.random() * eligible.length)];
      v.stunTimer = Math.max(v.stunTimer || 0, ms);
      window.Game.Audio.stun();
      this.spawnParticles(v.x, v.y - 10, '#ff9d3d', 8, 60);
      window.Game.UI.showToast(`Incident! ${v.def.name} is firefighting for ${Math.round(ms / 1000)}s (stunned, grayed out).`);
    },
    // A leaked enemy costs Budget directly — the sole consequence now that
    // there's no separate Users pool. Going negative doesn't end the run on
    // the spot; see the grace-period check at the end of update().
    onEnemyLeaked(enemy) {
      const def = enemy.def;
      this.budget -= enemy.leakCost;
      this.stats.lost += enemy.leakCost;
      window.Game.Audio.leak();
      this.shakeTimer = Math.max(this.shakeTimer, 0.25);
      this.spawnParticles(enemy.x, enemy.y, '#ff6b6b', 10, 80);
      this.effects.push({ type: 'floatText', x: enemy.x, y: enemy.y - 20, life: 1.1, maxLife: 1.1, text: '-' + window.Game.fmt(enemy.leakCost), color: '#ff6b6b' });
      if (enemy.type === 'competitor') this.stealBudget(def.budgetStealPct || 0);
      if (enemy.type === 'incident') this.stunRandomTeammate(def.stunMs || 0);
    },

    get projectedPayroll() {
      return this.towers.reduce((s, t) => s + t.salary, 0);
    },
    processPayday() {
      const total = this.projectedPayroll;
      if (total > 0) {
        this.budget -= total;
        this.stats.salaries += total;
        window.Game.Audio.payday();
        for (const t of this.towers) {
          const s = t.salary;
          if (s > 0) this.effects.push({ type: 'floatText', x: t.x, y: t.y - 50, life: 1.1, maxLife: 1.1, text: '-' + window.Game.fmt(s), color: '#ff6b6b' });
        }
      }
    },

    // ---- funding rounds ----
    applyStageTransition(stage) {
      const amount = stage.budgetInjection;
      this.budget += amount;
      if (amount > 0) {
        this.stats.income += amount;
        window.Game.Audio.fundingRound();
        this.spawnBigPayday(amount);
      }
      window.Game.UI.showToast(`${stage.name} closed! +${window.Game.fmt(amount)} Budget.`);
    },
    applyScaleUpMilestone(loopIndex) {
      const amount = Math.round(CFG.SCALEUP_INJECTION_BASE + CFG.SCALEUP_INJECTION_GROWTH * (loopIndex - 1));
      this.budget += amount;
      this.stats.income += amount;
      window.Game.Audio.fundingRound();
      this.spawnBigPayday(amount);
      window.Game.UI.showToast(`Scale-Up milestone: +${window.Game.fmt(amount)} Budget.`);
    },
    spawnBigPayday(amount) {
      this.effects.push({
        type: 'bigPayday', x: canvas.width / 2, y: canvas.height / 2,
        life: 2.4, maxLife: 2.4, text: '+' + window.Game.fmt(amount)
      });
    },

    spawnParticles(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (speed || 60) * (0.5 + Math.random() * 0.7);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, maxLife: 0.5, color });
      }
    },
    spawnRing(x, y, maxRadius, color) {
      this.effects.push({ type: 'ring', x, y, maxRadius, life: 0.35, maxLife: 0.35, color });
    },
    shake(amount) { this.shakeTimer = Math.max(this.shakeTimer, amount); },

    spawnEnemy(type, tier) { this.enemies.push(new Enemy(type, PATH.waypoints, tier)); },

    // Sprints auto-start on their own countdown now — this just lets the
    // player skip the wait early instead of being the only way to begin.
    requestNextWave() {
      const w = this.waves;
      if (w.active || w.betweenTimer <= 0) return;
      w.startNextWave(() => { this.processPayday(); this.sendLeaderboardCheckpoint(); });
    },

    start() {
      this.state = 'playing';
      window.Game.Audio.init();
      window.Game.UI.showScreen(null);
      window.Game.UI.updateHUD();
      window.Game.Leaderboard.runStart();
    },

    sendLeaderboardCheckpoint() {
      window.Game.Leaderboard.sendCheckpoint(this.waves.displayWaveNumber, this.budget, this.stats);
    },

    togglePause() {
      if (this.state === 'playing') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'playing';
      window.Game.UI.updateHUD();
    },

    // Any confirmation dialog goes through here so the game is always
    // paused behind it — nothing should keep ticking (budget, sprint
    // countdown, enemies) while the player hasn't answered a prompt yet.
    // Remembers whether it was actually playing (vs. already paused) so
    // cancel restores exactly what was true before, rather than always
    // resuming.
    openConfirmDialog(message, onConfirm) {
      this.dialogResumeToPlaying = this.state === 'playing';
      if (this.state === 'playing') this.state = 'paused';
      this.pendingConfirmAction = onConfirm;
      window.Game.UI.showConfirmDialog(message);
      window.Game.UI.updateHUD();
    },
    closeConfirmDialog(confirmed) {
      window.Game.UI.hideConfirmDialog();
      const action = this.pendingConfirmAction;
      this.pendingConfirmAction = null;
      if (confirmed && action) { action(); return; }
      if (this.dialogResumeToPlaying) this.state = 'playing';
      this.dialogResumeToPlaying = false;
      window.Game.UI.updateHUD();
    },

    toggleMute() {
      this.muted = !this.muted;
      window.Game.Audio.setMuted(this.muted);
      window.Game.UI.updateHUD();
    },

    restart() {
      this.budget = CFG.START_BUDGET;
      this.enemies = []; this.towers = []; this.projectiles = []; this.particles = []; this.effects = [];
      this.selectedTower = null; this.pendingHireDesk = null;
      this.speed = 1;
      this.negativeBudgetTimer = 0;
      this.autoPausedByVisibility = false;
      this.stats = { income: 0, salaries: 0, lost: 0, kills: 0 };
      Object.keys(this.cardCooldowns).forEach(k => (this.cardCooldowns[k] = 0));
      this.waves = new WaveManager();
      this.state = 'playing';
      window.Game.UI.updateUpgradePanel();
      window.Game.UI.showHirePanel(null);
      window.Game.UI.showScreen(null);
      window.Game.UI.updateHUD();
      window.Game.Leaderboard.runStart();
    },

    gameOver() {
      this.state = 'gameover';
      this.lastReachedSprint = Math.max(1, this.waves.displayWaveNumber);
      if (this.lastReachedSprint > this.bestSprint) { this.bestSprint = this.lastReachedSprint; saveBestSprint(this.lastReachedSprint); }
      window.Game.Audio.gameOver();
      window.Game.UI.showScreen('gameover');
      window.Game.UI.updateHUD();

      // Both fire-and-forget from gameOver's own point of view — the game-
      // over screen doesn't wait on either; the name dialog (if eligible)
      // and the leaderboard list just pop in a moment later once the
      // network round trip resolves.
      window.Game.Leaderboard.finishRun(this.lastReachedSprint, this.budget, this.stats).then((res) => {
        if (res && res.qualifiesForName) window.Game.UI.showNameDialog(res.rank);
      });
      window.Game.Leaderboard.fetchLeaderboard().then((entries) => window.Game.UI.renderLeaderboard(entries));
    },

    submitLeaderboardName(name) {
      return window.Game.Leaderboard.submitName(name).then((res) => {
        if (res && res.ok) {
          window.Game.UI.hideNameDialog();
          window.Game.Leaderboard.fetchLeaderboard().then((entries) => window.Game.UI.renderLeaderboard(entries));
        }
        return res;
      });
    },

    // Order: (1) wave scheduling fires payroll via a synchronous callback
    // strictly before that sprint's first spawn. (2) a stage transition
    // always applies its flat injection, no interruption. (3) leaks cost
    // Budget directly. (4) towers act. (5) once the frame's economy is
    // settled, the negative-Budget grace timer is checked — see the comment
    // above the check below for why that's deferred to the end of the frame.
    update(dt) {
      this.gameTime += dt;

      Object.keys(this.cardCooldowns).forEach(k => {
        if (this.cardCooldowns[k] > 0) this.cardCooldowns[k] = Math.max(0, this.cardCooldowns[k] - dt * 1000);
      });

      this.waves.update(dt, (t, tier) => this.spawnEnemy(t, tier), this.enemies.filter(e => !e.dead && !e.reachedEnd).length, () => { this.processPayday(); this.sendLeaderboardCheckpoint(); });

      if (this.waves.justEnteredStage >= 0) {
        const stage = CFG.FUNDING_STAGES[this.waves.justEnteredStage];
        this.applyStageTransition(stage);
        this.waves.justEnteredStage = -1;
      }
      if (this.waves.justHitScaleUpMilestone) {
        this.applyScaleUpMilestone(this.waves.justHitScaleUpMilestone);
        this.waves.justHitScaleUpMilestone = false;
      }

      for (const e of this.enemies) {
        if (e.dead || e.reachedEnd) continue;
        e.update(dt);
        if (e.reachedEnd) this.onEnemyLeaked(e);
      }

      for (const t of this.towers) t.update(dt, this.enemies, this.projectiles, this.effects);

      for (const p of this.projectiles) p.update(dt, this.enemies, this.particles);
      this.projectiles = this.projectiles.filter(p => !p.dead);

      for (const e of this.enemies) {
        if (e.dead) {
          this.addBudget(e.bounty, e.x, e.y - 10);
          this.stats.kills++;
          window.Game.Audio.death();
          this.spawnParticles(e.x, e.y, e.glow, 10, 90);
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead && !e.reachedEnd);

      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      }
      this.particles = this.particles.filter(p => p.life > 0);

      for (const fx of this.effects) fx.life -= dt;
      this.effects = this.effects.filter(fx => fx.life > 0);

      if (this.shakeTimer > 0) this.shakeTimer -= dt;

      // Deferred to the end of the frame rather than checked at each
      // individual money-losing event (payday, a leak, a competitor's
      // steal) so all of a frame's economy resolves before the grace
      // countdown starts/ticks/ends — one clean checkpoint instead of three
      // scattered ones that could each trigger it independently.
      if (this.budget < 0) {
        this.negativeBudgetTimer = this.negativeBudgetTimer > 0 ? this.negativeBudgetTimer - dt : CFG.NEGATIVE_BUDGET_GRACE;
        if (this.negativeBudgetTimer <= 0) { this.gameOver(); return; }
      } else if (this.negativeBudgetTimer > 0) {
        this.negativeBudgetTimer = 0;
        window.Game.UI.showToast('Back in the black — crisis averted.');
      }

      window.Game.UI.updateHUD();
    },

    // The boost is company-wide now, not radius-limited, so a big catchment
    // circle around the machine would be misleading — just a tight glow
    // directly on the machine itself to read as "actively buffing."
    drawAuraCircles(ctx) {
      const t = this.gameTime;
      for (const tower of this.towers) {
        if (tower.type !== 'coffee' || tower.stunTimer > 0) continue;
        const pulse = 0.7 + Math.sin(t * 1.6) * 0.3;
        ctx.save();
        const g = ctx.createRadialGradient(tower.x, tower.y, 0, tower.x, tower.y, 36);
        g.addColorStop(0, `rgba(176,131,240,${0.22 * pulse})`);
        g.addColorStop(1, 'rgba(176,131,240,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(tower.x, tower.y, 36, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },

    // Empty desks + the Coffee Machine spot render here (not in path.js's
    // background) since "occupied or not" is live game state — an occupied
    // desk just shows nothing here and the tower itself draws over it in
    // the normal depth-sorted pass below.
    drawDesks(ctx) {
      const t = this.gameTime;
      const Assets = window.Game.Assets;
      const deskSprite = Assets.get('prop_desk_empty');
      const hover = this.hoverTarget;
      for (const d of CFG.DESK_POSITIONS) {
        if (this.towers.some(tw => tw.col === d.col && tw.row === d.row)) continue;
        const c = PATH.cellCenter(d.col, d.row);
        const pulse = 0.5 + Math.sin(t * 2 + d.col * 3 + d.row * 5) * 0.2;
        const isHovered = hover && hover.type === 'desk' && hover.desk.col === d.col && hover.desk.row === d.row;
        const hoverMult = isHovered ? 1.12 : 1;
        ctx.save();
        ctx.translate(c.x, c.y);
        if (isHovered) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16; }
        let markerY = -12;
        if (deskSprite) {
          const h = 72 * hoverMult, w = h * (deskSprite.naturalWidth / deskSprite.naturalHeight);
          // Source art faces the opposite way from the seated-teammate art
          // (chair top-left vs. bottom-right) — mirrored to match so an
          // empty desk doesn't visibly "turn around" once someone's hired.
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(deskSprite, -w / 2, 14 - h, w, h);
          ctx.restore();
          markerY = 14 - h - 6;
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(0, 10, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#9c7a52';
          ctx.fillRect(-16, -4, 32, 10);
          ctx.fillStyle = '#6b4f30';
          ctx.fillRect(-15, 5, 4, 8); ctx.fillRect(11, 5, 4, 8);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = `rgba(57,255,136,${0.5 + pulse * 0.35})`;
        ctx.beginPath(); ctx.arc(0, markerY, 7, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#08150e';
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', 0, markerY + 1);
        ctx.restore();
      }

      // Same "+" pulsing marker as an empty desk (no floating price tag) —
      // the coffee spot now opens a confirm-to-hire panel just like a desk
      // does, instead of hiring instantly, so it gets the identical
      // no-cost-shown-on-canvas treatment.
      const cs = CFG.COFFEE_SPOT;
      if (!this.towers.some(tw => tw.col === cs.col && tw.row === cs.row)) {
        const c = PATH.cellCenter(cs.col, cs.row);
        const coffeeSprite = Assets.get('prop_coffee_broken');
        const coffeeHovered = hover && hover.type === 'coffee';
        const coffeeMult = coffeeHovered ? 1.12 : 1;
        const coffeePulse = 0.5 + Math.sin(t * 2 + cs.col * 3 + cs.row * 5) * 0.2;
        ctx.save();
        ctx.translate(c.x, c.y);
        if (coffeeHovered) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16; }
        let markerY = -12;
        if (coffeeSprite) {
          const h = 78 * coffeeMult, w = h * (coffeeSprite.naturalWidth / coffeeSprite.naturalHeight);
          ctx.drawImage(coffeeSprite, -w / 2, 14 - h, w, h);
          markerY = 14 - h - 6;
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(0, 10, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2c2a28';
          ctx.fillRect(-12, -30, 24, 34);
          if (Math.sin(t * 8) > 0.6) {
            ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1.5;
            ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(8, -26); ctx.lineTo(14, -20); ctx.lineTo(9, -18); ctx.lineTo(15, -12); ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 10 * coffeePulse;
        ctx.fillStyle = `rgba(57,255,136,${0.5 + coffeePulse * 0.35})`;
        ctx.beginPath(); ctx.arc(0, markerY, 7, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#08150e';
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', 0, markerY + 1);
        ctx.restore();
      }
    },

    drawEffects() {
      for (const fx of this.effects) {
        if (fx.type === 'bigPayday') continue; // drawn in drawScreenEffects instead — see there
        const a = Math.max(0, fx.life / fx.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        if (fx.type === 'lightning') {
          strokeGlowPath(ctx, fx.points, fx.color, fx.glow, 2.4);
        } else if (fx.type === 'flash') {
          ctx.shadowColor = fx.color; ctx.shadowBlur = 20;
          const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, fx.r);
          g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2); ctx.fill();
        } else if (fx.type === 'ring') {
          const r = fx.maxRadius * (1 - a) + fx.maxRadius * 0.15;
          ctx.strokeStyle = fx.color;
          ctx.shadowColor = fx.color; ctx.shadowBlur = 14;
          ctx.lineWidth = 4 * a + 1;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
        } else if (fx.type === 'floatText') {
          // GTA-pickup styling: bold outlined text with a quick pop-in scale.
          const riseY = fx.y - (1 - a) * 34;
          const popT = Math.min(1, (fx.maxLife - fx.life) / 0.15);
          const scale = 1 + (1 - popT) * 0.35;
          ctx.translate(fx.x, riseY);
          ctx.scale(scale, scale);
          ctx.font = 'bold 16px "Arial Black", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.strokeText(fx.text, 0, 0);
          ctx.shadowColor = fx.color; ctx.shadowBlur = 8;
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.text, 0, 0);
        }
        ctx.restore();
      }
    },

    // bigPayday is authored in raw viewport coordinates (dead center of the
    // screen, always — see below) rather than world coordinates, so unlike
    // every other effect it must draw OUTSIDE the camera transform. render()
    // calls this after ctx.restore(), once the camera transform is gone.
    drawScreenEffects() {
      for (const fx of this.effects) {
        if (fx.type !== 'bigPayday') continue;
        const a = Math.max(0, fx.life / fx.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        // A big funding injection landing (stage close / Scale-Up
        // milestone) is a bigger deal than a per-tower pickup — dead
        // center of the screen, large, and drifting up slowly as it fades
        // rather than the quick small pop-up used for per-tower amounts.
        const riseY = fx.y - (1 - a) * 70;
        const popT = Math.min(1, (fx.maxLife - fx.life) / 0.25);
        const scale = 0.85 + popT * 0.15;
        ctx.translate(fx.x, riseY);
        ctx.scale(scale, scale);
        ctx.font = 'bold 64px "Arial Black", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(fx.text, 0, 0);
        ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 28;
        ctx.fillStyle = '#39ff88';
        ctx.fillText(fx.text, 0, 0);
        ctx.restore();
      }
    },

    render() {
      ctx.save();
      if (this.shakeTimer > 0 && this.state === 'playing') {
        const mag = this.shakeTimer * 18;
        // Screen-space shake, applied BEFORE the camera transform below —
        // if it were applied after, its visual magnitude would get scaled
        // by zoom (invisible zoomed-out on a phone, huge zoomed-in).
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      window.Game.Camera.applyTransform(ctx);
      PATH.drawBackground(ctx);
      this.drawAuraCircles(ctx);
      this.drawDesks(ctx);

      const hoveredTower = this.hoverTarget && this.hoverTarget.type === 'tower' ? this.hoverTarget.tower : null;
      for (const t of this.towers) t.hovered = t === hoveredTower;

      // Painter's algorithm: towers and enemies must draw back-to-front by
      // screen-Y for the isometric board to occlude correctly (a teammate
      // "in front" needs to overlap one "behind" them as enemies walk past).
      const depthSorted = this.towers.concat(this.enemies).sort((a, b) => a.y - b.y);
      for (const obj of depthSorted) obj.draw(ctx);
      for (const p of this.projectiles) p.draw(ctx);
      this.drawEffects();
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (this.selectedTower) {
        const st = this.selectedTower;
        const pulse = 3 + Math.sin(this.gameTime * 5) * 2;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(st.x, st.y, 28 + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Coffee has no range ring — its boost is company-wide, not a
        // catchment area, so there's no distance to visualize.
        if (st.range) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath(); ctx.arc(st.x, st.y, st.range, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();

      this.drawScreenEffects();
      if (this.state === 'paused') this.drawPausedOverlay(ctx);
    },

    // Just the dim — the icon/text/click affordance is the DOM #pauseOverlay
    // element (see ui.js/CSS) so it can respond to hover and click directly.
    drawPausedOverlay(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,12,20,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },

    loop(ts) {
      const rawDt = Math.min(0.05, (ts - (this.lastTs || ts)) / 1000);
      this.lastTs = ts;
      if (this.state === 'playing') this.update(rawDt * this.speed);
      this.render();
      if (this.selectedTower) {
        window.Game.UI.updateUpgradePanel();
        window.Game.UI.positionUpgradePanel(this.selectedTower, canvas);
      }
      if (this.pendingHireDesk) window.Game.UI.refreshHirePanel();
      requestAnimationFrame(this.loop.bind(this));
    }
  };

  window.Game.Core = Core;
})();
