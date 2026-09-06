// Screen-space camera: pan + zoom applied only at draw-time and at the
// pointer-input conversion step. The world's own pixel layout (js/path.js)
// is fixed forever at boot (see PATH.init's fixed 1600x1000 call in
// game.js) — only the camera adapts to whatever viewport/zoom/pan the
// player has. Entities keep storing absolute world-pixel x/y exactly as
// before; hitTest/screenToCell/the economy are all untouched by this file.
(function () {
  const Camera = {
    viewportW: 0, viewportH: 0,
    worldW: 0, worldH: 0,
    zoom: 1, panX: 0, panY: 0,
    minZoom: 0.1, maxZoom: 3,

    // Called once at boot. Starts zoomed out just far enough to show the
    // whole board (auto-fit) — this alone is what fixes a small phone
    // screen only ever showing a clipped fragment of the world.
    init(viewportW, viewportH, worldW, worldH) {
      this.viewportW = viewportW; this.viewportH = viewportH;
      this.worldW = worldW; this.worldH = worldH;
      const fitZoom = Math.min(viewportW / worldW, viewportH / worldH) * 0.94;
      this.minZoom = fitZoom;
      this.maxZoom = Math.max(2.0, fitZoom * 3);
      this.zoom = fitZoom;
      this.panX = (viewportW - worldW * this.zoom) / 2;
      this.panY = (viewportH - worldH * this.zoom) / 2;
    },

    // Called on window resize. Re-clamps zoom/pan to the new viewport but
    // deliberately does NOT reset a zoom the player already dialed in
    // manually — only init() ever sets an auto-fit zoom.
    onResize(viewportW, viewportH) {
      this.viewportW = viewportW; this.viewportH = viewportH;
      const fitZoom = Math.min(viewportW / this.worldW, viewportH / this.worldH) * 0.94;
      this.minZoom = fitZoom;
      this.maxZoom = Math.max(2.0, fitZoom * 3);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
      this.clampPan();
    },

    worldToScreen(x, y) {
      return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY };
    },
    screenToWorld(x, y) {
      return { x: (x - this.panX) / this.zoom, y: (y - this.panY) / this.zoom };
    },

    // Keeps the world point currently under (screenX,screenY) fixed on
    // screen while changing zoom — the standard "zoom to cursor/pinch"
    // feel, rather than always zooming toward the viewport's center.
    zoomAround(factor, screenX, screenY) {
      const before = this.screenToWorld(screenX, screenY);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
      this.panX = screenX - before.x * this.zoom;
      this.panY = screenY - before.y * this.zoom;
      this.clampPan();
    },

    panBy(dxScreen, dyScreen) {
      this.panX += dxScreen;
      this.panY += dyScreen;
      this.clampPan();
    },

    // Standard "content cover" clamp: centers the world when it's smaller
    // than the viewport on an axis (can't pan past a fully-visible board),
    // otherwise keeps the world's edge from ever revealing empty space
    // beyond it on that axis.
    clampPan() {
      const scaledW = this.worldW * this.zoom;
      const scaledH = this.worldH * this.zoom;
      this.panX = scaledW <= this.viewportW
        ? (this.viewportW - scaledW) / 2
        : Math.min(0, Math.max(this.viewportW - scaledW, this.panX));
      this.panY = scaledH <= this.viewportH
        ? (this.viewportH - scaledH) / 2
        : Math.min(0, Math.max(this.viewportH - scaledH, this.panY));
    },

    applyTransform(ctx) {
      ctx.translate(this.panX, this.panY);
      ctx.scale(this.zoom, this.zoom);
    }
  };

  window.Game.Camera = Camera;
})();
