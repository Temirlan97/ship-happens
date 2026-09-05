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
