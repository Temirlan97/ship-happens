// Loads the real js/*.js files into the current jsdom global, in the exact
// dependency order index.html uses, via vm.runInThisContext — so tests
// exercise the actual shipped files (unmodified, no reimplementation), the
// same way a browser loading index.html's <script> tags would.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { installFixtureDom } from './dom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_DIR = path.resolve(__dirname, '../../js');

// main.js is intentionally excluded: it only wires `DOMContentLoaded` ->
// Core.init(), which starts the real rAF game loop — not something any
// test wants running in the background.
const SCRIPT_ORDER = [
  'config.js', 'assets.js', 'audio.js', 'path.js', 'camera.js',
  'entities.js', 'waves.js', 'game.js', 'ui.js'
];

/**
 * Resets window.Game and reloads the real game scripts fresh, with the real
 * index.html markup installed first (game.js reads #gameCanvas at its own
 * module-load time, so the DOM has to exist before it's loaded).
 * @param {string[]} [scripts] subset/order override, defaults to the full app.
 */
export function loadGame(scripts = SCRIPT_ORDER) {
  delete window.Game;
  installFixtureDom();
  for (const file of scripts) {
    const fullPath = path.join(JS_DIR, file);
    const src = fs.readFileSync(fullPath, 'utf8');
    // filename must be the real absolute path (not a bare relative name) —
    // v8's coverage collector keys captured ranges by this script URL, and
    // needs it to resolve back to the real file on disk to attribute
    // coverage to js/*.js at all.
    vm.runInThisContext(src, { filename: fullPath });
  }
  return window.Game;
}
