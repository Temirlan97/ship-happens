// Sprint spawn scheduler. The first CAMPAIGN_SPRINTS are hand-tuned; after
// that Scale-Up never "ends" — it cycles through the same patterns again with
// escalating enemy stats/counts, so there's always a harder sprint ahead.
// Also owns funding-stage transition detection (justEnteredStage) and the
// Scale-Up recurring-milestone flag (justHitScaleUpMilestone), both one-shot
// flags consumed the same frame they're set — safe here because stage effects
// are cosmetic/economic injections, not a hard ordering requirement (unlike
// payroll, which is threaded through as a synchronous onBeforeStart callback
// so it always runs strictly before that sprint's first spawn).
(function () {
  const CFG = window.Game.Config;

  class WaveManager {
    constructor() {
      this.waveIndex = -1;
      this.queue = [];
      this.timer = 0;
      this.active = false;
      this.betweenDuration = 9;
      // Counts down to the very first sprint too, not just the gaps between
      // later ones — previously this sat at 0 until the player manually
      // pressed Start Sprint, which was the only wave that ever needed it.
      this.betweenTimer = this.betweenDuration;
      this.justEnteredStage = -1;
      this.justHitScaleUpMilestone = false;
    }
    get displayWaveNumber() { return this.waveIndex + 1; }
    get tier() { return Math.max(0, this.waveIndex - (CFG.CAMPAIGN_SPRINTS - 1)); }
    get stageIndex() {
      let idx = 0;
      for (let i = 0; i < CFG.FUNDING_STAGES.length; i++) {
        if (this.displayWaveNumber >= CFG.FUNDING_STAGES[i].triggerSprint) idx = i;
      }
      return idx;
    }
    get stage() { return CFG.FUNDING_STAGES[this.stageIndex]; }

    buildWave(waveIndex) {
      const tier = Math.max(0, waveIndex - (CFG.CAMPAIGN_SPRINTS - 1));
      const template = CFG.SPRINTS[waveIndex % CFG.SPRINTS.length];
      const countMult = 1 + tier * CFG.ENDLESS_COUNT_GROWTH;
      return template.map((g) => ({
        type: g.type,
        count: tier === 0 ? g.count : Math.round(g.count * countMult),
        interval: g.interval,
        gap: g.gap || 0
      }));
    }

    startNextWave(onBeforeStart) {
      if (this.active) return;
      // payday runs guaranteed before this sprint's first spawn.
      if (onBeforeStart) onBeforeStart();

      const prevStage = this.stageIndex;
      this.waveIndex++;
      const newStage = this.stageIndex;
      this.justEnteredStage = newStage !== prevStage ? newStage : -1;
      this.justHitScaleUpMilestone = false;
      if (newStage === CFG.FUNDING_STAGES.length - 1) {
        const into = this.displayWaveNumber - CFG.FUNDING_STAGES[newStage].triggerSprint;
        if (into > 0 && into % CFG.SCALEUP_LOOP_SPRINTS === 0) this.justHitScaleUpMilestone = into / CFG.SCALEUP_LOOP_SPRINTS;
      }

      const wave = this.buildWave(this.waveIndex);
      const tier = this.tier;
      this.queue = [];
      let t = 0;
      for (const group of wave) {
        for (let i = 0; i < group.count; i++) {
          this.queue.push({ type: group.type, t, tier });
          t += group.interval;
        }
        t += group.gap || 0;
      }
      this.timer = 0;
      this.active = true;
      this.betweenTimer = 0;
      window.Game.Audio.sprintStart();
    }

    skipCountdown(onBeforeStart) {
      if (!this.active && this.betweenTimer > 0) {
        this.betweenTimer = 0;
        this.startNextWave(onBeforeStart);
      }
    }

    update(dt, spawnFn, enemiesAliveCount, onBeforeStart) {
      if (this.active) {
        this.timer += dt * 1000;
        while (this.queue.length && this.timer >= this.queue[0].t) {
          const item = this.queue.shift();
          spawnFn(item.type, item.tier);
        }
        if (this.queue.length === 0 && enemiesAliveCount === 0) {
          this.active = false;
          this.betweenTimer = this.betweenDuration;
        }
      } else if (this.betweenTimer > 0) {
        this.betweenTimer -= dt;
        if (this.betweenTimer <= 0) this.startNextWave(onBeforeStart);
      }
    }
  }

  window.Game.Waves = { WaveManager };
})();
