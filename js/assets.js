// Sprite asset manifest + loader + tint cache. Every render call site
// references art ONLY by these logical keys — never a hardcoded path — so
// swapping in different art later (a new Kenney pack, or custom-made art)
// means replacing the file at that path, with zero changes anywhere else.
//
// Missing/not-yet-provided art is NOT a fatal error: a failed image load is
// just recorded as "unavailable" (Assets.has(key) === false), and callers
// are expected to fall back to something else (currently: the original
// procedural canvas drawing) when a sprite isn't ready yet. This lets the
// asset pipeline grow incrementally — e.g. the ground/scenery tiles are real
// art today while the character sprites are still being generated.
(function () {
  const MANIFEST = {
    // Ground tiles — generated office art (see assets/source_*.jpeg). Key
    // names kept from the original Kenney-grass version so path.js's tile
    // layout logic never needed to change, only what these paths point to.
    tile_grass: 'assets/tiles/office_floor.png',
    tile_path: 'assets/tiles/office_carpet.png',
    // A turn piece for path corners — drawn for the {west,south} connection;
    // path.js mirrors it on both axes to cover the other 3 turn directions.
    tile_grass_trees: 'assets/tiles/office_floor_plant.png',
    tile_grass_rocks: 'assets/tiles/office_floor_rug.png',
    tile_grass_crystals: 'assets/tiles/office_floor_plant.png',
    // One seamless painted scene covering the whole board — replaces the
    // per-tile floor grid once generated (see path.js's drawBackground).
    bg_office: 'assets/tiles/office_background.png',
    prop_kanban_board: 'assets/tiles/prop_kanban.png',
    prop_product_kiosk: 'assets/tiles/prop_kiosk.png',
    // Office decoration set — empty desk/broken coffee machine markers plus
    // ambient clutter scattered on spare floor cells (see path.js buildTileMap).
    prop_desk_empty: 'assets/tiles/prop_desk_empty.png',
    prop_coffee_broken: 'assets/tiles/prop_coffee_broken.png',
    prop_watercooler: 'assets/tiles/prop_watercooler.png',
    prop_bookshelf: 'assets/tiles/prop_bookshelf.png',
    prop_whiteboard: 'assets/tiles/prop_whiteboard.png',
    prop_beanbag: 'assets/tiles/prop_beanbag.png',
    prop_pizzaboxes: 'assets/tiles/prop_pizzaboxes.png',

    // Teammates + Coffee Machine — base sprite (used as the rank-art
    // fallback) plus a generated sprite per rank (1-4); entities.js tries
    // the exact rank first, falls back to the base sprite, then to
    // procedural drawing. Enemies have no rank variants.
    character_engineer: 'assets/characters/engineer.png',
    character_engineer_1: 'assets/characters/engineer_1.png',
    character_engineer_2: 'assets/characters/engineer_2.png',
    character_engineer_3: 'assets/characters/engineer_3.png',
    character_engineer_4: 'assets/characters/engineer_4.png',
    character_sre: 'assets/characters/sre.png',
    character_sre_1: 'assets/characters/sre_1.png',
    character_sre_2: 'assets/characters/sre_2.png',
    character_sre_3: 'assets/characters/sre_3.png',
    character_sre_4: 'assets/characters/sre_4.png',
    character_qa: 'assets/characters/qa.png',
    character_qa_1: 'assets/characters/qa_1.png',
    character_qa_2: 'assets/characters/qa_2.png',
    character_qa_3: 'assets/characters/qa_3.png',
    character_qa_4: 'assets/characters/qa_4.png',
    character_pm: 'assets/characters/pm.png',
    character_pm_1: 'assets/characters/pm_1.png',
    character_pm_2: 'assets/characters/pm_2.png',
    character_pm_3: 'assets/characters/pm_3.png',
    character_pm_4: 'assets/characters/pm_4.png',
    character_coffee: 'assets/characters/coffee.png',
    character_coffee_1: 'assets/characters/coffee_1.png',
    character_coffee_2: 'assets/characters/coffee_2.png',
    character_coffee_3: 'assets/characters/coffee_3.png',
    character_coffee_4: 'assets/characters/coffee_4.png',
    enemy_bug: 'assets/enemies/bug.png',
    enemy_competitor: 'assets/enemies/competitor.png'
  };

  const images = {};   // key -> HTMLImageElement, only present if load succeeded
  const tintCache = {}; // "key|#hex" -> offscreen canvas

  function loadAll(onDone) {
    const keys = Object.keys(MANIFEST);
    let remaining = keys.length;
    if (remaining === 0) { onDone(); return; }
    keys.forEach((key) => {
      const img = new Image();
      const settle = () => { remaining--; if (remaining <= 0) onDone(); };
      img.onload = () => { images[key] = img; settle(); };
      img.onerror = settle; // missing art is expected during rollout — not fatal
      img.src = MANIFEST[key];
    });
  }

  function get(key) { return images[key] || null; }
  function has(key) { return !!images[key]; }

  // Multiply-tints a sprite with a flat color while preserving its alpha
  // silhouette, so one base character sprite could serve multiple roles if
  // needed. Cached per (key, color) pair since it's an offscreen-canvas draw.
  function tinted(key, hexColor) {
    const img = images[key];
    if (!img) return null;
    const cacheKey = key + '|' + hexColor;
    if (tintCache[cacheKey]) return tintCache[cacheKey];
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = hexColor;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(img, 0, 0);
    tintCache[cacheKey] = c;
    return c;
  }

  window.Game = window.Game || {};
  window.Game.Assets = { loadAll, get, has, tinted, MANIFEST };
})();
