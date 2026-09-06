# Tests

Run with `npm test` (or `npm run coverage` for a coverage report).

## Why two tiers

`tests/logic/` covers the code where a silent regression would actually
matter: economy math, path/grid geometry, wave scheduling, combat/stat
formulas, hit-testing. These are held to a near-100% coverage threshold
(see `vitest.config.js`) via real behavioral assertions.

`tests/render/` covers canvas drawing (`draw()` methods) and DOM wiring
(`ui.js`). These are asserted at a lighter "runs without throwing and takes
the right branch" level rather than pixel/call-count assertions — mocking
a canvas 2D context to assert exact draw calls has a poor cost/value ratio
(it mostly just re-describes the implementation), and the project's actual
history this session backs that up: every real regression caught along the
way (hover cursors, resize snapping, desk mirroring, corner-tile rendering)
was caught by *running the game in a browser and looking at it*, not by
asserting canvas call counts. The smoke tests here exist to catch crashes
and gross branch mistakes cheaply in CI; a full visual check before release
still belongs in a real browser.

## How the game code is loaded

Every file in `js/` is a plain `<script>`-loaded IIFE that attaches to the
global `window.Game` namespace — there's no module system and no build
step (that's a deliberate property of this project, not an oversight).

`tests/helpers/loadGame.js` loads the real files from disk and runs them via
`vm.runInThisContext`, in the exact order `index.html` does, against the
same jsdom `window` Vitest's test environment provides. This exercises the
actual shipped code, not a reimplementation — if a file starts throwing at
load time, or a call site refers to a stale name, these tests fail exactly
the way loading `index.html` in a real browser would.

`tests/helpers/dom.js` installs the *real* `index.html` markup (minus its
`<script>` tags) into the jsdom document, rather than a hand-maintained
duplicate fixture, so the DOM element IDs tests rely on can't silently
drift from what actually ships.

`tests/helpers/setupEnv.js` installs a couple of browser APIs jsdom doesn't
implement: a minimal `AudioContext` stand-in (so functions with sound side
effects run unmodified instead of needing every test to know which calls
happen to make noise) and a working no-op `<canvas>` 2D context.

`tests/helpers/fakeImage.js` is opt-in (only some `tests/render/*` tests use
it): it replaces `window.Image` with a stub that "loads" synchronously, so
tests can exercise the real-sprite-art code paths in `entities.js`/`path.js`
and not just their art-not-ready-yet procedural fallbacks.

## The leaderboard backend (`functions/`)

`functions/_shared/plausibility.js` and `functions/_shared/nameFilter.js`
are plain ES modules (unlike `js/*.js`, Pages Functions were never part of
the "no ES modules" constraint — that's specifically about the
`<script>`-loaded client files), so they're imported and unit-tested
directly with real vitest: `tests/logic/leaderboard-plausibility.test.js`
(including a drift-guard test that loads the real `js/config.js` and
asserts its constants match the hand-duplicated copies in
`plausibility.js` — a Pages Function can't `import` a `window`-global IIFE
file, so this is what keeps the anti-cheat floor from silently drifting
out of sync with the real game's balance) and
`tests/logic/name-filter.test.js`. `tests/logic/admin-auth.test.js` covers
the admin password check the same way.

`functions/api/**` (the actual `onRequestGet`/`onRequestPost` handlers) and
`functions/_shared/http.js` (thin wrappers around `Response`/`fetch`/
`crypto.subtle`) are deliberately **not** unit-tested — every SQL statement
in them is a trivial single-table parameterized query with no joins, and
investing in Miniflare/full HTTP integration tests for a handful of simple
endpoints would be exactly the disproportionate-cost-for-value tradeoff
this file already argues against for canvas rendering above. These are
verified the same way: `wrangler pages dev` (which emulates D1 locally)
plus real `curl`/browser play-throughs before shipping a change — see
`js/leaderboard.js`'s own tests (`tests/render/leaderboard.test.js`) for
where the client-side half of this is covered instead (mocked `fetch`/
`sendBeacon`, verifying it degrades silently on any network failure).
