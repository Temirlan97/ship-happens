// Replaces window.Image with a stub that "loads" synchronously and
// successfully. jsdom doesn't fetch/decode real images, so without this
// every sprite stays permanently unloaded in tests and only the
// procedural-fallback drawing branches (art not ready yet) would ever run —
// a real, legitimate code path, but not the only one that matters. Installing
// this before calling Assets.loadAll lets the "sprite loaded" branches in
// entities.js/path.js run for real too.
class FakeImage {
  constructor() {
    this.naturalWidth = 64;
    this.naturalHeight = 64;
    this._src = '';
    this.onload = null;
    this.onerror = null;
  }
  set src(value) {
    this._src = value;
    if (this.onload) this.onload();
  }
  get src() { return this._src; }
}

export function installFakeImage() {
  window.Image = FakeImage;
}
