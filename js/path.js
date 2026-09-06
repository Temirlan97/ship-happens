// Isometric board on a TRUE projection — using real generated office art
// (assets/tiles/, see assets/source_*.jpeg).
//
// Projection: classic 2:1 isometric — x = originX + (col-row)*(TILE_W/2),
// y = originY + (col+row)*(TILE_H/2). Enemy movement/tower targeting in
// entities.js/game.js operate purely on these pixel coordinates already, so
// this formula is the ENTIRE grid-geometry story; pathing/placement logic
// elsewhere is untouched. PATH.init is called exactly once at boot with a
// FIXED reference size (see game.js) — the world's own pixel layout never
// changes again after that; window resizing is handled entirely by
// js/camera.js panning/zooming a view onto this fixed world instead.
(function () {
  const CFG = window.Game.Config;
  const { COLS, ROWS } = CFG;

  const TILE_W = 132;     // on-screen diamond footprint width (matches the sprite art)
  const TILE_H = 66;      // on-screen diamond footprint height (2:1 ratio)
  const TILE_IMG_H = 99;  // full sprite height incl. the block's "depth" below the diamond
  const BORDER_PAD = 8;   // extra decorative tile-rings drawn beyond the playable grid, so a
                           // wide/short viewport doesn't show empty space past the diamond

  let originX = 0, originY = 0;
  let BOARD_W = 0, BOARD_H = 0;
  let waypoints = null, roadPoints = null;

  function cellCenter(col, row) {
    return { x: originX + (col - row) * (TILE_W / 2), y: originY + (col + row) * (TILE_H / 2) };
  }
  // Inverse of cellCenter — used for click/hover-to-cell conversion.
  function screenToCell(x, y) {
    const a = (x - originX) / (TILE_W / 2);
    const b = (y - originY) / (TILE_H / 2);
    return { col: Math.round((a + b) / 2), row: Math.round((b - a) / 2) };
  }

  const blocked = new Set();
  const key = (c, r) => c + ',' + r;
  for (let c = 0; c <= 13; c++) blocked.add(key(c, 1));
  for (let r = 1; r <= 4; r++) blocked.add(key(13, r));
  for (let c = 2; c <= 13; c++) blocked.add(key(c, 4));
  for (let r = 4; r <= 8; r++) blocked.add(key(2, r));
  for (let c = 2; c <= 15; c++) blocked.add(key(c, 8));

  function isBuildable(col, row) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    return !blocked.has(key(col, row));
  }

  // The path is a zigzag of alternating horizontal/vertical straight runs
  // (see the `blocked` construction above) — a path cell's carpet art needs
  // to be mirrored depending on which axis it runs along, or the baked-in
  // stripe reads perpendicular to the actual direction of travel.
  function isHorizontalRun(col, row) { return blocked.has(key(col - 1, row)) || blocked.has(key(col + 1, row)); }
  function isVerticalRun(col, row) { return blocked.has(key(col, row - 1)) || blocked.has(key(col, row + 1)); }

  // Centers the logical COLS x ROWS diamond inside a viewportW x viewportH
  // canvas. Called at boot (init) and again on every window resize
  // (relayout, from Core.handleResize) — both go through this same function.
  function relayout(viewportW, viewportH) {
    BOARD_W = viewportW; BOARD_H = viewportH;
    originX = 0; originY = 0; // temporary, just to measure the diamond's own bounds below
    const corners = [cellCenter(0, 0), cellCenter(COLS - 1, 0), cellCenter(0, ROWS - 1), cellCenter(COLS - 1, ROWS - 1)];
    const minX = Math.min(...corners.map(c => c.x)) - TILE_W / 2;
    const maxX = Math.max(...corners.map(c => c.x)) + TILE_W / 2;
    const minY = Math.min(...corners.map(c => c.y)) - TILE_H / 2;
    const maxY = Math.max(...corners.map(c => c.y)) + (TILE_IMG_H - TILE_H) + 90; // + room for tall character sprites
    originX = viewportW / 2 - (minX + maxX) / 2;
    originY = viewportH / 2 - (minY + maxY) / 2 + 90; // bias down slightly for the top headroom above

    // Mutate the SAME array in place (not `waypoints = [...]`) — Enemy
    // instances hold a reference to this array from construction, so a
    // reassignment would leave in-flight enemies pointing at stale data
    // after a resize; mutating in place keeps them live automatically.
    // No off-screen endpoints on either side: the FIRST waypoint is the
    // Backlog kanban board (enemies spawn right there, not sliding in from
    // the screen edge), and the LAST is the Product itself, so reachedEnd
    // fires exactly when an enemy arrives there.
    const fresh = [
      cellCenter(0, 1), cellCenter(13, 1),
      cellCenter(13, 4), cellCenter(2, 4),
      cellCenter(2, 8), cellCenter(15, 8)
    ];
    if (!waypoints) waypoints = [];
    waypoints.length = 0;
    fresh.forEach(p => waypoints.push(p));
    roadPoints = waypoints.slice();

    markers = null; tileMap = null; motes = null; // all depended on the old layout/size
  }
  function init(viewportW, viewportH) { relayout(viewportW, viewportH); }

  // ---- deterministic ground-tile layout + ambient motes (built lazily,
  // after init() has set BOARD_W/BOARD_H) ----
  let tileMap = null; // "col,row" -> manifest key, includes the decorative border ring
  let propMap = null; // "col,row" -> standalone decor prop key, sparse, playable area only
  let motes = null;
  const DECOR_PROPS = ['prop_watercooler', 'prop_bookshelf', 'prop_whiteboard', 'prop_beanbag', 'prop_pizzaboxes'];
  // Cells that always get a specific decor prop, bypassing the random roll
  // below — used to guarantee a visual buffer between two desks placed just
  // one cell apart (col:14, rows 2 and 4), rather than leaving it to chance.
  const FORCED_PROPS = { '14,3': 'prop_bookshelf' };
  function buildTileMap() {
    let seed = 918273;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 10000) / 10000; };
    tileMap = {};
    propMap = {};
    for (let row = -BORDER_PAD; row < ROWS + BORDER_PAD; row++) {
      for (let col = -BORDER_PAD; col < COLS + BORDER_PAD; col++) {
        const k = key(col, row);
        const inBounds = col >= 0 && row >= 0 && col < COLS && row < ROWS;
        if (inBounds && blocked.has(k)) { tileMap[k] = 'tile_path'; continue; }
        if (!inBounds) { tileMap[k] = 'tile_grass'; continue; } // plain filler, no decoration roll
        const isDeskCell = CFG.DESK_POSITIONS.some(d => d.col === col && d.row === row) ||
          (col === CFG.COFFEE_SPOT.col && row === CFG.COFFEE_SPOT.row);
        if (isDeskCell) { tileMap[k] = 'tile_grass'; continue; } // keep desk tiles plain so the marker reads clearly
        if (FORCED_PROPS[k]) { tileMap[k] = 'tile_grass'; propMap[k] = FORCED_PROPS[k]; continue; }
        const roll = rand();
        if (roll < 0.10) tileMap[k] = 'tile_grass_crystals';
        else if (roll < 0.17) tileMap[k] = 'tile_grass_rocks';
        else if (roll < 0.22) tileMap[k] = 'tile_grass_trees';
        else {
          tileMap[k] = 'tile_grass';
          // A sparse extra layer of standalone furniture props on otherwise
          // plain floor — deliberately low odds so the office fills out
          // without turning into visual noise.
          if (rand() < 0.06) propMap[k] = DECOR_PROPS[Math.floor(rand() * DECOR_PROPS.length)];
        }
      }
    }
    motes = [];
    for (let i = 0; i < 26; i++) {
      motes.push({
        x: rand() * BOARD_W, y: rand() * BOARD_H,
        r: 1 + rand() * 1.8, phase: rand() * Math.PI * 2, speed: 0.3 + rand() * 0.4,
        amp: 10 + rand() * 18
      });
    }
  }

  function roadMarkers(spacing) {
    const pts = [];
    let carried = 0;
    for (let i = 0; i < roadPoints.length - 1; i++) {
      const a = roadPoints[i], b = roadPoints[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      let d = spacing - carried;
      while (d < segLen) {
        const t = d / segLen;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        d += spacing;
      }
      carried = segLen - (d - spacing);
    }
    return pts;
  }
  let markers = null;

  // Draws every ground tile (playable grid + decorative border) in strict
  // (row+col) ascending order — required painter's-algorithm order for this
  // projection, since each tile sprite has visible "block depth" below its
  // diamond top face that must be occluded correctly by nearer tiles.
  function drawGroundTiles(ctx) {
    if (!tileMap) buildTileMap();
    const Assets = window.Game.Assets;
    // Once a seamless background image is available (see drawBackground),
    // the plain floor cells no longer need their own bordered diamond
    // sprite — that individually-outlined grid look is exactly what the
    // background image replaces. Path tiles and decorative props (rug/
    // plant cells) still render individually either way.
    const bgLoaded = !!Assets.get('bg_office');
    const cells = [];
    for (let row = -BORDER_PAD; row < ROWS + BORDER_PAD; row++) {
      for (let col = -BORDER_PAD; col < COLS + BORDER_PAD; col++) cells.push({ col, row });
    }
    cells.sort((a, b) => (a.col + a.row) - (b.col + b.row));
    for (const { col, row } of cells) {
      const k = key(col, row);
      const tileKey = tileMap[k];
      const c = cellCenter(col, row);
      const skipTile = bgLoaded && tileKey === 'tile_grass';
      if (!skipTile) {
        const img = Assets.get(tileKey) || Assets.get('tile_grass');
        if (img) {
          const horiz = tileKey === 'tile_path' && isHorizontalRun(col, row);
          const vert = tileKey === 'tile_path' && isVerticalRun(col, row);
          // Corner (turn) cells have no dedicated art — every attempt at a
          // corner-specific carpet sprite has come out looking worse than
          // just leaving it plain, so those cells fall back to the bare
          // floor tile below instead of trying to draw a path sprite at all.
          const isCorner = horiz && vert;
          if (isCorner) {
            const grassImg = Assets.get('tile_grass');
            if (grassImg) ctx.drawImage(grassImg, c.x - TILE_W / 2, c.y - TILE_H / 2, TILE_W, TILE_IMG_H);
          } else if (horiz && !vert) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_IMG_H);
            ctx.restore();
          } else {
            ctx.drawImage(img, c.x - TILE_W / 2, c.y - TILE_H / 2, TILE_W, TILE_IMG_H);
          }
        } // else: art not loaded yet — flat base fill shows through
      }

      const propKey = propMap[k];
      if (propKey) {
        const propImg = Assets.get(propKey);
        if (propImg) {
          const h = 60, w = h * (propImg.naturalWidth / propImg.naturalHeight);
          ctx.drawImage(propImg, c.x - w / 2, c.y + 14 - h, w, h);
        }
      }
    }
  }

  function drawBackground(ctx) {
    const t = window.Game.Core.gameTime; // frozen while paused — every animation below follows
    const w = BOARD_W, h = BOARD_H;

    // A seamless painted background (once generated — see bg_office in
    // assets.js) replaces the flat fill, covering the whole viewport in one
    // draw so the plain floor no longer reads as a grid of individually
    // outlined tiles. Falls back to the flat fill until that art exists.
    const bg = window.Game.Assets.get('bg_office');
    if (bg) ctx.drawImage(bg, 0, 0, w, h);
    else { ctx.fillStyle = '#d8cba9'; ctx.fillRect(0, 0, w, h); }

    drawGroundTiles(ctx);

    // flowing CI/CD build trace down the middle of the path
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(120,255,180,0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 16]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    roadPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();

    if (!markers) markers = roadMarkers(96);
    for (const m of markers) {
      const pulse = 0.6 + Math.sin(t * 2 + m.x * 0.01) * 0.4;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.shadowColor = '#8affc4'; ctx.shadowBlur = 8 * pulse;
      ctx.fillStyle = `rgba(140,255,190,${0.5 + pulse * 0.4})`;
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (!motes) buildTileMap();
    for (const m of motes) {
      const x = m.x + Math.sin(t * m.speed + m.phase) * m.amp;
      const y = m.y + Math.cos(t * m.speed * 0.7 + m.phase) * m.amp * 0.5;
      const tw = 0.4 + Math.sin(t * 3 + m.phase) * 0.3;
      ctx.fillStyle = `rgba(150,230,255,${0.18 + tw * 0.22})`;
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
    }

    drawIntakeBoard(ctx, t);
    drawProduct(ctx, t);
  }

  // ---- "Backlog" spawn point: a cork board with three swaying ticket notes.
  // Swaps to real generated art (assets.tinted-free — just a static prop
  // sprite) once assets/tiles has it; falls back to this procedural version. ----
  function drawIntakeBoard(ctx, t) {
    const p = waypoints[0];
    const bx = p.x - 6, by = p.y;
    const sprite = window.Game.Assets.get('prop_kanban_board');
    if (sprite) {
      const h = 90, w = h * (sprite.naturalWidth / sprite.naturalHeight);
      ctx.drawImage(sprite, bx - w / 2, by - h + 14, w, h);
      return;
    }
    ctx.save();
    ctx.translate(bx, by);

    ctx.fillStyle = 'rgba(60,50,30,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 30, 22, 6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(-3, -6, 6, 34);

    const boardGrad = ctx.createLinearGradient(0, -34, 0, -2);
    boardGrad.addColorStop(0, '#c9a876'); boardGrad.addColorStop(1, '#ad8657');
    ctx.fillStyle = boardGrad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-24, -34, 48, 32, 3); else ctx.rect(-24, -34, 48, 32);
    ctx.fill();
    ctx.strokeStyle = '#7a5c3a'; ctx.lineWidth = 2;
    ctx.stroke();

    const colors = ['#ff8f6b', '#ffd76b', '#7bdc9e'];
    const notePositions = [[-13, -25], [3, -20], [-4, -8]];
    colors.forEach((c, i) => {
      const [nx, ny] = notePositions[i];
      const sway = Math.sin(t * 1.4 + i * 2) * 0.06;
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(sway + (i - 1) * 0.08);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(-8.5, -6.5, 17, 13);
      ctx.fillStyle = c;
      ctx.fillRect(-9, -7, 17, 13);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(5, -2); ctx.moveTo(-6, 2); ctx.lineTo(2, 2); ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  // ---- "the Product": a kiosk, tinted by financial health — how many
  // paydays of runway the current Budget covers at the current burn rate.
  // Swaps to real generated art once available; the health-color glow is
  // drawn behind the sprite either way so it works for both paths. ----
  function drawProduct(ctx, t) {
    const end = waypoints[waypoints.length - 1];
    const Core = window.Game.Core;
    let ratio = 1;
    if (Core) {
      const payroll = Core.projectedPayroll;
      ratio = payroll > 0 ? Math.min(1, Math.max(0, Core.budget / (payroll * 3))) : 1;
    }
    const healthColor = ratio > 0.5 ? '#39c97a' : (ratio > 0.2 ? '#f2a340' : '#e0503c');
    const px = end.x + 14, py = end.y;

    const sprite = window.Game.Assets.get('prop_product_kiosk');
    if (sprite) {
      ctx.save();
      const pulse = 0.6 + Math.sin(t * 3) * 0.4;
      ctx.shadowColor = healthColor; ctx.shadowBlur = 24 * pulse;
      const h = 100, w = h * (sprite.naturalWidth / sprite.naturalHeight);
      ctx.drawImage(sprite, px - w / 2, py - h + 16, w, h);
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(px, py);

    ctx.fillStyle = 'rgba(60,50,30,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 32, 28, 8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#3a4150';
    ctx.fillRect(-4, -4, 8, 34);
    ctx.beginPath(); ctx.moveTo(-16, 30); ctx.lineTo(16, 30); ctx.lineTo(10, 22); ctx.lineTo(-10, 22); ctx.closePath(); ctx.fill();

    const bezelGrad = ctx.createLinearGradient(0, -60, 0, -4);
    bezelGrad.addColorStop(0, '#2a2f3a'); bezelGrad.addColorStop(1, '#161a22');
    ctx.fillStyle = bezelGrad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-30, -60, 60, 56, 4); else ctx.rect(-30, -60, 60, 56);
    ctx.fill();

    const glitch = ratio < 0.35 && Math.sin(t * 23) > 0.85 ? (Math.random() - 0.5) * 6 : 0;
    ctx.save();
    ctx.translate(glitch, 0);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-26, -56, 52, 48, 2); else ctx.rect(-26, -56, 52, 48);
    ctx.clip();

    ctx.fillStyle = '#0d1420';
    ctx.fillRect(-26, -56, 52, 48);

    ctx.fillStyle = healthColor;
    ctx.shadowColor = healthColor; ctx.shadowBlur = 8;
    ctx.fillRect(-26, -56, 52, 7);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = healthColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const lx = -24 + i * 4.3;
      const ly = -30 + Math.sin(t * 2 + i * 0.8) * 6 * ratio - (1 - ratio) * 4;
      if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-24, -18, 22, 6);
    ctx.fillRect(-24, -9, 14, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(2, -18, 22, 15);
    ctx.restore();

    ctx.shadowColor = healthColor; ctx.shadowBlur = 18;
    ctx.strokeStyle = healthColor; ctx.lineWidth = 1.4;
    ctx.strokeRect(-30, -60, 60, 56);
    ctx.shadowBlur = 0;

    const pulse = 0.6 + Math.sin(t * 3) * 0.4;
    ctx.shadowColor = healthColor; ctx.shadowBlur = 8 * pulse;
    ctx.fillStyle = healthColor;
    ctx.beginPath(); ctx.arc(24, -54, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  window.Game.Path = {
    init, relayout, isBuildable, cellCenter, screenToCell, drawBackground, blocked,
    TILE_W, TILE_H,
    get waypoints() { return waypoints; },
    get BOARD_W() { return BOARD_W; },
    get BOARD_H() { return BOARD_H; }
  };
})();
