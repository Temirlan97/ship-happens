import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_SPRINTS, ENDLESS_COUNT_GROWTH, SPRINTS, MAX_GAME_SPEED, START_BUDGET,
  MAX_PLAUSIBLE_SPRINT, BUDGET_CEILING_PER_SECOND,
  minSpawnMs, sprintFloorSeconds, budgetCeiling, checkPlausibility
} from '../../functions/_shared/plausibility.js';
import { loadGame } from '../helpers/loadGame.js';

// The single most important test in this file: functions/_shared/plausibility.js
// hand-duplicates SPRINTS/CAMPAIGN_SPRINTS/ENDLESS_COUNT_GROWTH from the real
// js/config.js because a Pages Function can't import a window-global IIFE
// file. If a future balance-tuning pass changes those constants and forgets
// to update the copy, the plausibility floor silently drifts out of sync
// with the real game — this test turns that into a loud CI failure instead.
describe('plausibility constants stay in sync with the real game config', () => {
  it('SPRINTS/CAMPAIGN_SPRINTS/ENDLESS_COUNT_GROWTH exactly match js/config.js', () => {
    const Game = loadGame();
    const CFG = Game.Config;
    expect(CAMPAIGN_SPRINTS).toBe(CFG.CAMPAIGN_SPRINTS);
    expect(ENDLESS_COUNT_GROWTH).toBe(CFG.ENDLESS_COUNT_GROWTH);
    expect(SPRINTS).toEqual(CFG.SPRINTS);
    expect(START_BUDGET).toBe(CFG.START_BUDGET);
  });

  it('MAX_GAME_SPEED matches the real cycleSpeed() ceiling', () => {
    const Game = loadGame();
    const Core = Game.Core;
    // cycleSpeed cycles 1x -> 2x -> 3x -> 4x -> 1x ...; three calls from the
    // starting 1x reaches its highest point, right before it wraps back around.
    expect(Core.speed).toBe(1);
    Core.cycleSpeed(); Core.cycleSpeed(); Core.cycleSpeed();
    expect(Core.speed).toBe(MAX_GAME_SPEED);
  });
});

describe('minSpawnMs', () => {
  it('sprint 0 (first campaign sprint: 6 bugs, 900ms interval) — last spawn at (6-1)*900', () => {
    expect(minSpawnMs(0)).toBe(5 * 900);
  });

  it('a multi-group sprint carries the FULL prior group duration (not just its last spawn) into the next group, plus the gap between them', () => {
    // SPRINTS[2] = [{bug,6,800,600}, {competitor,4,400,0}]. The bug group's 6
    // spawns consume 6*800ms end-to-end (not (6-1)*800 — the next group starts
    // one full interval after the bug group's own last spawn), then +600 gap,
    // then the competitor group's last (4th) spawn is 3*400 further in.
    expect(minSpawnMs(2)).toBe(6 * 800 + 600 + 3 * 400);
  });

  it('scales enemy counts (not interval/gap) once past CAMPAIGN_SPRINTS, via ENDLESS_COUNT_GROWTH', () => {
    const campaignFinalIndex = CAMPAIGN_SPRINTS - 1; // tier 0, last hand-tuned sprint
    const firstEndlessIndex = CAMPAIGN_SPRINTS; // tier 1
    const endlessMs = minSpawnMs(firstEndlessIndex);
    // Same template as SPRINTS[firstEndlessIndex % SPRINTS.length] but scaled up —
    // just assert it's strictly larger than the tier-0 version of the same template index.
    const templateIndex = firstEndlessIndex % SPRINTS.length;
    const tierZeroEquivalent = minSpawnMs(templateIndex);
    expect(endlessMs).toBeGreaterThanOrEqual(tierZeroEquivalent);
  });
});

describe('sprintFloorSeconds', () => {
  it('is 0 for sprint 0 (no sprints completed yet)', () => {
    expect(sprintFloorSeconds(0)).toBe(0);
  });

  it('is strictly increasing — reaching a higher sprint always takes at least as long', () => {
    let prev = 0;
    for (let n = 1; n <= 20; n++) {
      const floor = sprintFloorSeconds(n);
      expect(floor).toBeGreaterThanOrEqual(prev);
      prev = floor;
    }
  });

  it('divides by MAX_GAME_SPEED (the fastest any legitimate client can advance)', () => {
    const oneSprintMs = minSpawnMs(0);
    expect(sprintFloorSeconds(1)).toBeCloseTo((oneSprintMs / 1000) / MAX_GAME_SPEED, 6);
  });

  it('clamps an absurd claimedSprint at MAX_PLAUSIBLE_SPRINT instead of looping forever', () => {
    // Both should compute in real time (proof the loop is bounded) and
    // agree exactly, since anything past the clamp is treated the same.
    expect(sprintFloorSeconds(1e9)).toBe(sprintFloorSeconds(MAX_PLAUSIBLE_SPRINT));
    expect(sprintFloorSeconds(MAX_PLAUSIBLE_SPRINT + 1)).toBe(sprintFloorSeconds(MAX_PLAUSIBLE_SPRINT));
  });

  it('treats a NaN claimedSprint as 0 rather than looping forever or throwing', () => {
    expect(sprintFloorSeconds(NaN)).toBe(0);
  });
});

describe('budgetCeiling', () => {
  it('is exactly START_BUDGET at zero elapsed time', () => {
    expect(budgetCeiling(0)).toBe(START_BUDGET);
  });

  it('grows linearly with elapsed real seconds at BUDGET_CEILING_PER_SECOND', () => {
    expect(budgetCeiling(10)).toBe(START_BUDGET + BUDGET_CEILING_PER_SECOND * 10);
  });

  it('never goes below START_BUDGET for negative elapsed time (clock skew)', () => {
    expect(budgetCeiling(-5)).toBe(START_BUDGET);
  });
});

describe('checkPlausibility', () => {
  it('is not suspicious for a run that took at least the floor time and sent checkpoints', () => {
    const claimedSprint = 5;
    const floor = sprintFloorSeconds(claimedSprint);
    const result = checkPlausibility({ claimedSprint, elapsedSeconds: floor * 2, checkpointCount: 5 });
    expect(result.suspicious).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('flags a run that claims a high sprint far faster than physically possible', () => {
    const result = checkPlausibility({ claimedSprint: 30, elapsedSeconds: 2, checkpointCount: 30 });
    expect(result.suspicious).toBe(true);
    expect(result.reasons).toContain('time_floor_violated');
  });

  it('flags a run with zero checkpoints past the early-sprint grace threshold — a forged one-shot POST', () => {
    const claimedSprint = 10;
    const floor = sprintFloorSeconds(claimedSprint);
    const result = checkPlausibility({ claimedSprint, elapsedSeconds: floor * 2, checkpointCount: 0 });
    expect(result.suspicious).toBe(true);
    expect(result.reasons).toContain('no_checkpoints');
  });

  it('does not require checkpoints for very early sprints (grace threshold)', () => {
    const claimedSprint = 2;
    const floor = sprintFloorSeconds(claimedSprint);
    const result = checkPlausibility({ claimedSprint, elapsedSeconds: floor * 2, checkpointCount: 0 });
    expect(result.suspicious).toBe(false);
  });

  it('can flag both reasons at once', () => {
    const result = checkPlausibility({ claimedSprint: 30, elapsedSeconds: 1, checkpointCount: 0 });
    expect(result.reasons).toEqual(expect.arrayContaining(['time_floor_violated', 'no_checkpoints']));
  });

  it('flags a budget claimed far above what the elapsed time could plausibly have earned', () => {
    // A tiny claimed sprint keeps the time-floor/checkpoint checks quiet, so
    // this isolates the budget ceiling specifically — the exact "low sprint,
    // huge budget" forgery this check exists to close.
    const result = checkPlausibility({ claimedSprint: 1, elapsedSeconds: 5, checkpointCount: 0, budget: 50_000_000 });
    expect(result.suspicious).toBe(true);
    expect(result.reasons).toEqual(['budget_ceiling_violated']);
  });

  it('does not flag a budget right at (or under) the ceiling for the elapsed time', () => {
    const elapsedSeconds = 120;
    const result = checkPlausibility({
      claimedSprint: 1, elapsedSeconds, checkpointCount: 0, budget: budgetCeiling(elapsedSeconds)
    });
    expect(result.suspicious).toBe(false);
  });

  it('skips the budget check entirely when no budget is claimed', () => {
    const result = checkPlausibility({ claimedSprint: 0, elapsedSeconds: 0, checkpointCount: 0, budget: null });
    expect(result.suspicious).toBe(false);
  });

  it('ignores a non-finite budget claim rather than crashing or false-flagging', () => {
    const result = checkPlausibility({ claimedSprint: 1, elapsedSeconds: 5, checkpointCount: 0, budget: NaN });
    expect(result.suspicious).toBe(false);
  });
});
