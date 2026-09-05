// Global test environment setup, applied once per test file (see
// vitest.config.js's setupFiles). jsdom has no Web Audio implementation, and
// the game's audio.js touches AudioContext lazily (only when a sound
// actually fires — see audio.js's ensureCtx), not at load time. Rather than
// special-case every test that exercises a code path with a sound side
// effect (payday, leaks, kills, ...), a minimal stand-in AudioContext is
// installed globally so those real functions run exactly as shipped.
class FakeAudioParam {
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeAudioNode {
  connect() { return this; }
  disconnect() {}
}
class FakeGainNode extends FakeAudioNode {
  constructor() { super(); this.gain = new FakeAudioParam(); }
}
class FakeBiquadFilterNode extends FakeAudioNode {
  constructor() { super(); this.frequency = new FakeAudioParam(); this.type = 'lowpass'; }
}
class FakeOscillatorNode extends FakeAudioNode {
  constructor() {
    super();
    this.frequency = new FakeAudioParam();
    this.detune = { value: 0 };
    this.type = 'sine';
  }
  start() {}
  stop() {}
}
class FakeAudioBufferSourceNode extends FakeAudioNode {
  constructor() { super(); this.buffer = null; }
  start() {}
  stop() {}
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = new FakeAudioNode();
  }
  createGain() { return new FakeGainNode(); }
  createOscillator() { return new FakeOscillatorNode(); }
  createBiquadFilter() { return new FakeBiquadFilterNode(); }
  createBufferSource() { return new FakeAudioBufferSourceNode(); }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {}
}

window.AudioContext = FakeAudioContext;

// jsdom has no real <canvas> 2D implementation and logs a "Not implemented"
// warning every time getContext('2d') is called. game.js legitimately calls
// this once at load time (see js/game.js's top-level `canvas.getContext`)
// and every logic-tier test loads game.js, so left alone this prints dozens
// of times per run. Returning null quietly is exactly jsdom's own real
// behavior here (verified: it doesn't throw) — this just drops the log spam.
window.HTMLCanvasElement.prototype.getContext = () => null;
