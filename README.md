# Ship Happens

A browser-based tower defense game where the "towers" are your startup's
team, the "enemies" are bugs/competitors/incidents, and the resource you're
defending is your company's cash. Hire teammates at desks around the
office, promote them, and don't run out of money before the next funding
round closes.

Plain HTML/CSS/JavaScript, no build step, no external runtime
dependencies — open `index.html` in a browser and it runs.

## Running it locally

Any static file server works, since the game fetches its own assets by
relative path (loading `index.html` directly via `file://` also works, with
`localStorage` best-sprint persistence silently unavailable in that mode).

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Running the tests

Requires Node.js. Test tooling (Vitest) is a dev-only dependency — it never
ships with the game itself.

```bash
npm install
npm test           # run once
npm run test:watch # watch mode
npm run coverage   # coverage report (text + tests/../coverage/index.html)
```

See `tests/README.md` for how the test suite is organized and why.

## Deploying (Cloudflare Pages)

The game is a static site, so deploys are a plain directory upload — no
build step. `.assetsignore` excludes everything that isn't part of the
shipped game (tests, coverage, source art, docs, `node_modules`) from the
upload.

```bash
npx wrangler login   # once, opens a browser to authorize this machine
npm run deploy        # wrangler pages deploy . --project-name=ship-happens
```

The first deploy creates the `ship-happens` Pages project if it doesn't
exist yet. `npm run pages:dev` serves the same directory locally through
Wrangler's Pages emulator (`http://localhost:8788`) if you want to sanity
check before deploying.

`.github/workflows/deploy.yml` runs the test suite on every push/PR, and on
push to `main` deploys straight to Cloudflare Pages via
`cloudflare/wrangler-action`. That job needs two repo secrets set under
Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN` — a token with the "Cloudflare Pages — Edit"
  permission (create one at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)).
- `CLOUDFLARE_ACCOUNT_ID` — found on the right-hand sidebar of any page in
  the Cloudflare dashboard.

## Project layout

- `index.html` / `css/style.css` — markup and styling for the HUD, panels,
  and screen overlays; the game board itself is a `<canvas>`.
- `js/` — game code, loaded as plain `<script>` tags in dependency order
  (`config` → `assets` → `audio` → `path` → `entities` → `waves` → `game`
  → `ui` → `main`), each attaching to the shared `window.Game` namespace.
- `assets/` — sprite art (tiles, characters, enemies). `art-sources/`
  alongside it holds raw image-generation source files kept for reference,
  not loaded by the game.
- `tests/` — Vitest suite; see `tests/README.md`.

## Asset credits

Some tile-naming conventions trace back to Kenney's CC0 isometric tower
defense set (`assets/KENNEY_LICENSE.txt`); most in-game art has since been
replaced with custom-generated art specific to this game's theme.

## License

See `LICENSE`.
