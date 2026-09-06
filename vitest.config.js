import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/helpers/setupEnv.js'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js', 'functions/_shared/**/*.js'],
      exclude: ['js/main.js'],
      reporter: ['text', 'html'],
      thresholds: {
        // Logic-bearing files are held to ~100%; rendering/DOM-wiring files
        // (entities.js draw methods, path.js draw methods, ui.js) are
        // covered at a lighter smoke-test level by design — see the plan
        // notes in tests/README.md for the reasoning. functions/_shared is
        // the anti-cheat plausibility check and the name-content filter —
        // exactly the "silent regression would matter" category, same bar
        // as js/config.js. The thin functions/api/** request handlers are
        // deliberately left out of `include` — see tests/README.md's
        // leaderboard section for why (not disproportionate integration-test
        // infra for a handful of single-table endpoints).
        'js/config.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'js/camera.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'js/path.js': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'js/entities.js': { statements: 80, branches: 75, functions: 85, lines: 80 },
        'js/waves.js': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'js/game.js': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'functions/_shared/plausibility.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'functions/_shared/nameFilter.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'functions/_shared/adminAuth.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'functions/_shared/rateLimit.js': { statements: 100, branches: 100, functions: 100, lines: 100 }
      }
    }
  }
});
