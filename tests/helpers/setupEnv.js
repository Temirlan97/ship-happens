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

// jsdom has no real <canvas> 2D implementation. A working (no-op) stub is
// installed instead of returning null: Phase 1 (logic) tests never touch
// ctx so it wouldn't matter to them, but Phase 2 (rendering smoke tests)
// needs every draw()/render() call to actually run against something
// method-shaped rather than throw on ctx.save() etc. Style property
// assignment (ctx.fillStyle = ...) needs no special handling — plain
// objects accept arbitrary own-property writes.
class FakeGradient {
  addColorStop() { return this; }
}
class FakeCanvasContext {
  save() {} restore() {}
  translate() {} scale() {} rotate() {} transform() {} setTransform() {} resetTransform() {}
  beginPath() {} closePath() {}
  moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} arcTo() {}
  arc() {} ellipse() {} rect() {} roundRect() {}
  fill() {} stroke() {} clip() {}
  fillRect() {} strokeRect() {} clearRect() {}
  fillText() {} strokeText() {}
  measureText() { return { width: 0 }; }
  drawImage() {}
  createRadialGradient() { return new FakeGradient(); }
  createLinearGradient() { return new FakeGradient(); }
  createPattern() { return null; }
  setLineDash() {} getLineDash() { return []; }
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this.__fakeCtx) this.__fakeCtx = new FakeCanvasContext();
  return this.__fakeCtx;
};
