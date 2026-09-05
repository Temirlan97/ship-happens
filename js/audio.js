// All sound effects are synthesized with the Web Audio API at runtime — no
// audio files. Every action layers 2-3 primitives (tone/sweep/noise) with
// slight randomization so repeated sounds (shots, hits) don't feel robotic.
(function () {
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function envGain(t0, attack, duration, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    return g;
  }

  function tone(freq, duration, type, peak, opts) {
    if (muted || !ctx) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.detune) osc.detune.value = opts.detune;
    const g = envGain(t0, opts.attack || 0.008, duration, peak || 0.25);
    let node = osc;
    if (opts.filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.filterFreq;
      node.connect(f); node = f;
    }
    node.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function sweep(freqStart, freqEnd, duration, type, peak, opts) {
    if (muted || !ctx) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    const g = envGain(t0, opts.attack || 0.008, duration, peak || 0.25);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function noiseBurst(duration, peak, filterFreq, opts) {
    if (muted || !ctx) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'lowpass';
    filter.frequency.setValueAtTime(filterFreq || 1500, t0);
    if (opts.filterSweepTo) filter.frequency.exponentialRampToValueAtTime(opts.filterSweepTo, t0 + duration);
    const g = envGain(t0, opts.attack || 0.004, duration, peak || 0.3);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  const SFX = {
    init() { ensureCtx(); },
    setMuted(v) { muted = v; },
    isMuted() { return muted; },

    // ---- attacks ----
    engineerShoot() { // bolt — a keyboard-clack flourish is the primary sound here
      ensureCtx();
      const clicks = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < clicks; i++) {
        noiseBurst(0.03, rnd(0.32, 0.4), rnd(2200, 3400), { delay: i * rnd(0.018, 0.03), filterType: 'bandpass', attack: 0.0008 });
        tone(rnd(1800, 2400), 0.02, 'square', 0.05, { delay: i * rnd(0.018, 0.03) + 0.002 });
      }
      sweep(rnd(1400, 1700), rnd(2400, 2800), 0.07, 'triangle', 0.06, { delay: clicks * 0.026 });
    },
    sreShoot() { // lob — a short "dispatch" beep-boop, then the rollback whoosh
      ensureCtx();
      tone(rnd(760, 820), 0.05, 'square', 0.09);
      tone(rnd(560, 600), 0.05, 'square', 0.09, { delay: 0.07 });
      noiseBurst(0.18, 0.22, 700, { filterSweepTo: 200, delay: 0.14 });
      tone(90, 0.16, 'sine', 0.22, { delay: 0.14 });
    },
    qaShoot() { // lightning — a quick "test pass" chime, then the zap
      ensureCtx();
      tone(1500, 0.05, 'sine', 0.09);
      tone(1900, 0.06, 'sine', 0.11, { delay: 0.05 });
      for (let i = 0; i < 4; i++) noiseBurst(0.04, 0.14, rnd(3000, 7000), { delay: 0.1 + i * 0.02, filterType: 'highpass' });
      sweep(2200, 3200, 0.08, 'sawtooth', 0.12, { delay: 0.1 });
      sweep(180, 60, 0.4, 'sine', 0.12, { delay: 0.12 });
    },

    // ---- impacts ----
    engineerImpact() {
      ensureCtx();
      tone(rnd(900, 1100), 0.07, 'sine', 0.14);
      noiseBurst(0.05, 0.1, 4000);
    },
    sreImpact() {
      ensureCtx();
      noiseBurst(0.32, 0.32, 900, { filterSweepTo: 150 });
      tone(55, 0.35, 'sine', 0.28);
      for (let i = 0; i < 3; i++) noiseBurst(0.03, 0.08, rnd(2000, 5000), { delay: 0.05 + i * 0.04, filterType: 'highpass' });
    },

    hit() { ensureCtx(); noiseBurst(0.05, 0.1, 2500); },
    death() {
      ensureCtx();
      sweep(rnd(420, 480), 120, 0.3, 'sine', 0.14);
      sweep(rnd(620, 700), 200, 0.3, 'sine', 0.08, { delay: 0.04, detune: 6 });
    },
    budgetGain() {
      ensureCtx();
      tone(1250, 0.07, 'sine', 0.13);
      tone(1660, 0.09, 'sine', 0.13, { delay: 0.05 });
    },
    place() {
      ensureCtx();
      tone(220, 0.09, 'square', 0.12);
      sweep(700, 1300, 0.12, 'sine', 0.12, { delay: 0.03 });
    },
    promote() {
      ensureCtx();
      [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, { delay: i * 0.06 }));
    },
    error() { ensureCtx(); tone(140, 0.15, 'sawtooth', 0.15); },
    sprintStart() {
      ensureCtx();
      sweep(160, 90, 0.5, 'sawtooth', 0.16);
      tone(220, 0.5, 'triangle', 0.12, { delay: 0.05 });
    },
    fundingRound() {
      ensureCtx();
      [523, 659, 784, 988, 1175].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, { delay: i * 0.09 }));
    },
    leak() { // an enemy reached Production — a costly miss
      ensureCtx();
      noiseBurst(0.28, 0.26, 300);
      sweep(220, 55, 0.32, 'square', 0.18);
    },
    budgetStolen() {
      ensureCtx();
      sweep(500, 260, 0.22, 'sawtooth', 0.16);
      noiseBurst(0.12, 0.14, 1200);
    },
    payday() {
      ensureCtx();
      tone(330, 0.12, 'square', 0.1);
      tone(260, 0.14, 'square', 0.09, { delay: 0.08 });
    },
    stun() {
      ensureCtx();
      for (let i = 0; i < 5; i++) noiseBurst(0.03, 0.1, rnd(1500, 4000), { delay: i * 0.03, filterType: 'highpass' });
      sweep(700, 90, 0.3, 'square', 0.12);
    },
    gameOver() {
      ensureCtx();
      [220, 196, 174, 146].forEach((f, i) => tone(f, 0.5, 'triangle', 0.2, { delay: i * 0.22 }));
    }
  };

  window.Game = window.Game || {};
  window.Game.Audio = SFX;
})();
