// Central tuning values for "Ship Happens" — a startup-survival tower defense.
// Theme: you're a tiny team keeping a software product alive. Defenders are
// software-org roles hired at fixed desk spots around the office; threats are
// bugs/competitors/incidents that cost Budget directly if they reach
// Production — Budget is the single resource the whole game revolves around.
// Hires draw ongoing salary (see SALARY_*), and progression is staged as
// funding rounds (FUNDING_STAGES) rather than a flat wave counter.
(function () {
  const Config = {
    CELL: 60,
    COLS: 16,
    ROWS: 10,
    START_BUDGET: 22000,
    CAMPAIGN_SPRINTS: 10, // after this, Scale-Up (endless) begins
    // Going negative doesn't end the run immediately — this many seconds of
    // grace to earn/claw back into the black before the company folds.
    NEGATIVE_BUDGET_GRACE: 12,

    TOWER_TYPES: {
      engineer: {
        name: 'Software Engineer', cost: 5000, cooldown: 2200,
        range: 130, fireRate: 620, damage: 9, projectileSpeed: 560,
        attack: 'bolt', splash: 0, slow: 0,
        color: '#5b9dff', glow: '#a9c9ff', core: '#eef5ff',
        ranks: ['Junior Engineer', 'Software Engineer II', 'Senior Engineer', 'Staff Engineer'],
        salaryBase: 800
      },
      sre: {
        name: 'SRE / DevOps', cost: 12500, cooldown: 6000,
        range: 118, fireRate: 1450, damage: 27, projectileSpeed: 320,
        attack: 'lob', splash: 85, slow: 0,
        color: '#f2a340', glow: '#ffcf8a', core: '#fff3c4',
        ranks: ['DevOps Engineer', 'SRE', 'Senior SRE', 'Principal SRE'],
        salaryBase: 1800
      },
      qa: {
        name: 'QA Engineer', cost: 17500, cooldown: 9000,
        range: 145, fireRate: 1300, damage: 17, projectileSpeed: 0,
        attack: 'lightning', slow: 0.4, slowDuration: 1600,
        chainRange: 110, chainFalloff: 0.55,
        color: '#34d1b0', glow: '#8be9d6', core: '#ffffff',
        ranks: ['QA Engineer', 'Senior QA Engineer', 'QA Lead', 'Head of Quality'],
        salaryBase: 2400
      },
      pm: {
        name: 'Product Manager', cost: 7500, cooldown: 5000,
        income: 1200, interval: 4000,
        color: '#f2c94c', glow: '#ffe27a', core: '#fff8dc',
        ranks: ['Associate PM', 'Product Manager', 'Senior PM', 'Director of Product / CPO'],
        salaryBase: 1000
      },
      coffee: {
        name: 'Coffee Machine', cost: 50000, cooldown: 8000,
        attack: 'aura', auraDmgMult: 0.15, auraRateMult: 0.12,
        color: '#b083f0', glow: '#d9c4ff', core: '#f5eeff',
        ranks: ['Drip Machine', 'Espresso Machine', 'Barista Station', 'Cold Brew Command Center'],
        salaryBase: 2000
        // No unlock gate — always available, just very expensive.
      }
    },

    // Fixed desk spots scattered around the office — the only places a
    // teammate can be hired. Clicking an empty one opens a role picker.
    // Replaces the old "click any buildable tile" placement + headcount cap:
    // the number of desks IS the team-size ceiling now, no separate number.
    DESK_POSITIONS: [
      { col: 2, row: 0 }, { col: 5, row: 0 }, { col: 8, row: 0 }, { col: 11, row: 0 },
      { col: 14, row: 2 }, { col: 14, row: 3 }, { col: 5, row: 3 },
      { col: 9, row: 5 }, { col: 1, row: 5 }, { col: 1, row: 7 },
      { col: 4, row: 9 }, { col: 12, row: 9 }
    ],
    // The Coffee Machine gets one distinct spot, not part of the desk pool
    // above — it's a single fixed-role "broken machine you can fix", not a
    // generic desk with a role picker.
    COFFEE_SPOT: { col: 7, row: 6 },

    // Per-level multipliers applied to base stats (level 1 = base, index 0 unused).
    UPGRADE_MULT: [null,
      { dmg: 1,   range: 1,    rate: 1,    cost: 1 },
      { dmg: 1.5, range: 1.1,  rate: 0.9,  cost: 1 },
      { dmg: 2.1, range: 1.2,  rate: 0.8,  cost: 1 },
      { dmg: 2.9, range: 1.32, rate: 0.68, cost: 1 }
    ],
    AURA_LEVEL_MULT: [null, 1, 1.4, 1.8, 2.2], // scales an EM's own aura bonuses by its level
    UPGRADE_BASE_COST_FACTOR: 0.9, // upgrade to level N costs base cost * factor * N
    MAX_TOWER_LEVEL: 4,

    // Salary (Budget/sprint, deducted at payday) scales by rank like combat stats do.
    SALARY_MULT: [null, 1.0, 1.6, 2.3, 3.0],
    SALARY_ENDLESS_GROWTH: 0.10, // +10% per Scale-Up tier

    // Firing someone costs severance up front — a multiple of their current
    // per-sprint salary, so a senior/high-tier hire costs more to let go
    // than a junior one, same as their salary already does.
    SEVERANCE_SALARY_MULT: 2,

    // `leakCost` is deducted from Budget directly if the enemy reaches
    // Production — the sole consequence of a leak now that there's no
    // separate Users pool to erode.
    ENEMY_TYPES: {
      bug: {
        name: 'Bug', hp: 55, speed: 72, leakCost: 2500, bounty: 600, radius: 14,
        color: '#35c26b', glow: '#baffb0'
      },
      competitor: {
        name: 'Competitor', hp: 30, speed: 138, leakCost: 3000, bounty: 500, radius: 11,
        color: '#ff8a4c', glow: '#ffcf8a', budgetStealPct: 0.08,
        // Its art (a rocket, nose left) faces the opposite way from the
        // bug's art — see the flip composition in Enemy.drawSprite.
        artFacing: -1
      },
      incident: {
        name: 'Incident', hp: 190, speed: 44, leakCost: 5500, bounty: 1500, radius: 19,
        color: '#d43b3b', glow: '#ffcf4d', stunMs: 3000
      }
    },

    // Hand-tuned campaign sprints. Each sprint = spawn groups; each group spawns
    // `count` enemies `interval` ms apart, then `gap` ms before the next group.
    SPRINTS: [
      [{ type: 'bug', count: 6, interval: 900, gap: 0 }],
      [{ type: 'bug', count: 9, interval: 750, gap: 0 }],
      [{ type: 'bug', count: 6, interval: 800, gap: 600 }, { type: 'competitor', count: 4, interval: 400, gap: 0 }],
      [{ type: 'competitor', count: 9, interval: 450, gap: 0 }],
      [{ type: 'bug', count: 8, interval: 700, gap: 800 }, { type: 'incident', count: 2, interval: 1200, gap: 0 }],
      [{ type: 'competitor', count: 6, interval: 450, gap: 600 }, { type: 'incident', count: 3, interval: 1200, gap: 0 }],
      [{ type: 'bug', count: 10, interval: 600, gap: 700 }, { type: 'competitor', count: 6, interval: 400, gap: 0 }],
      [{ type: 'incident', count: 6, interval: 1000, gap: 700 }, { type: 'competitor', count: 6, interval: 400, gap: 0 }],
      [{ type: 'bug', count: 10, interval: 550, gap: 600 }, { type: 'competitor', count: 8, interval: 380, gap: 600 }, { type: 'incident', count: 4, interval: 1100, gap: 0 }],
      [{ type: 'incident', count: 9, interval: 900, gap: 700 }, { type: 'competitor', count: 10, interval: 350, gap: 700 }, { type: 'bug', count: 10, interval: 400, gap: 0 }]
    ],

    // Endless scaling after CAMPAIGN_SPRINTS: sprint N (N > CAMPAIGN_SPRINTS) gets
    // this many extra tiers of growth applied to every enemy's hp/speed/count.
    ENDLESS_HP_GROWTH: 0.20,
    ENDLESS_SPEED_GROWTH: 0.05,
    ENDLESS_COUNT_GROWTH: 0.12,

    // ---- Funding rounds: the progression spine (replaces a flat wave counter).
    // Each transition just injects Budget — no perk pick, no interruption.
    FUNDING_STAGES: [
      { key: 'preseed', name: 'Pre-Seed', triggerSprint: 1, budgetInjection: 0 },
      { key: 'seed', name: 'Seed', triggerSprint: 3, budgetInjection: 15000 },
      { key: 'seriesA', name: 'Series A', triggerSprint: 5, budgetInjection: 25000 },
      { key: 'seriesB', name: 'Series B', triggerSprint: 7, budgetInjection: 35000 },
      { key: 'seriesC', name: 'Series C', triggerSprint: 9, budgetInjection: 50000 },
      { key: 'scaleup', name: 'Scale-Up', triggerSprint: 11, budgetInjection: 70000 }
    ],
    SCALEUP_LOOP_SPRINTS: 5, // recurring injection cadence once inside Scale-Up
    SCALEUP_INJECTION_BASE: 40000,
    SCALEUP_INJECTION_GROWTH: 15000
  };

  window.Game = window.Game || {};
  window.Game.Config = Config;
  // Shared money formatter — every $ readout in the game goes through this
  // so real-scale figures (thousands of dollars) get thousands separators
  // instead of running digits together.
  window.Game.fmt = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
})();
