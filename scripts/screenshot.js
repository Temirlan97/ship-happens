// Ad-hoc visual verification tool — launches a real Chromium (via
// Playwright), loads the running `npm run pages:dev` server, starts a
// fresh game (clicking through the one-time name/gender picker the same
// way a real player would), and saves a screenshot. This is the
// "real headless-browser visual check" CLAUDE.md's Testing section has
// asked for since before this tool actually existed — canvas rendering
// bugs (a sprite's exact position, a color, a layout) are exactly the
// class of thing the vitest render-tier smoke tests deliberately don't
// (and can't usefully) assert on.
//
// Usage: node scripts/screenshot.js [outputPath] [--url=http://localhost:8788]
//   [--width=1600] [--height=1000] [--wait=800]
//
// Requires `npm run pages:dev` already running in another terminal/process
// — this script does not manage that server's lifecycle itself, so repeat
// screenshots (e.g. iterating on a position tweak) don't pay a fresh
// wrangler boot each time.
import { chromium } from 'playwright';
import path from 'path';

function parseArgs(argv) {
  const opts = { url: 'http://localhost:8788', width: 1600, height: 1000, wait: 800, out: 'scratchpad/screenshot.png' };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) opts.url = arg.slice(6);
    else if (arg.startsWith('--width=')) opts.width = parseInt(arg.slice(8), 10);
    else if (arg.startsWith('--height=')) opts.height = parseInt(arg.slice(9), 10);
    else if (arg.startsWith('--wait=')) opts.wait = parseInt(arg.slice(7), 10);
    else if (!arg.startsWith('--')) opts.out = arg;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const pageCtx = await browser.newContext({ viewport: { width: opts.width, height: opts.height } });
  const page = await pageCtx.newPage();
  await page.goto(opts.url, { waitUntil: 'networkidle' });

  // Play a fresh game: click Play, then (since this is a brand-new browser
  // context — no localStorage) click through the one-time identity picker,
  // same sequence a real first-time player takes.
  await page.click('#menuPlayBtn');
  const pickerVisible = await page.locator('#menuNamePickPanel').isVisible().catch(() => false);
  if (pickerVisible) {
    await page.click('#ceoPortraitMaleBtn');
  }
  await page.waitForTimeout(opts.wait); // let a few animation frames render

  const outPath = path.resolve(process.cwd(), opts.out);
  await page.screenshot({ path: outPath });
  console.log('Saved screenshot to', outPath);
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
