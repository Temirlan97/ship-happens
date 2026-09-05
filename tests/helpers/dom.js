// Installs the REAL index.html markup into the current jsdom document,
// rather than a hand-maintained duplicate fixture — so tests can never
// silently drift from what actually ships (a stale hand-rolled fixture
// would give false confidence: every element ID it's missing would just
// make game.js/ui.js throw at load time, exactly like they would if the
// real markup were broken, so testing against the real thing is strictly
// more honest here).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dirname, '../../index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const bodyMatch = indexHtml.match(/<body>([\s\S]*)<\/body>/);
if (!bodyMatch) throw new Error('tests/helpers/dom.js: could not find <body> in index.html');
// Strip the <script> tags — those are loaded separately (and deliberately)
// by tests/helpers/loadGame.js, not executed as real <script> elements.
const bodyHtml = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, '');

export function installFixtureDom() {
  document.body.innerHTML = bodyHtml;
}
