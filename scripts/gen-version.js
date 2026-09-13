// Regenerates version.json right before every deploy (see package.json's
// "deploy" script) — never hand-edit or commit this file. The frontend
// fetches it with cache: 'no-store' at load time (see js/ui.js) so the
// on-screen version badge is immune to the js/css static-asset caching
// issue described in CLAUDE.md: index.html always revalidates, so a
// fetch of a fresh sibling file bypasses the caching problem entirely
// instead of needing a manual ?v=N bump like every other asset does.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const builtAt = new Date().toISOString();

writeFileSync(
  join(__dirname, '..', 'version.json'),
  JSON.stringify({ commit, builtAt })
);

console.log(`version.json -> ${commit} @ ${builtAt}`);
