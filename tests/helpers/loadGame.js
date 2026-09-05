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
  'config.js', 'assets.js', 'audio.js', 'path.js',
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
    const src = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInThisContext(src, { filename: file });
  }
  return window.Game;
}
