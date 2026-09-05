import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/helpers/setupEnv.js'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/main.js'],
      reporter: ['text', 'html'],
      thresholds: {
        // Logic-bearing files are held to ~100%; rendering/DOM-wiring files
        // (entities.js draw methods, path.js draw methods, ui.js) are
        // covered at a lighter smoke-test level by design — see the plan
        // notes in tests/README.md for the reasoning.
        'js/config.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'js/path.js': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'js/entities.js': { statements: 80, branches: 75, functions: 85, lines: 80 },
        'js/waves.js': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'js/game.js': { statements: 90, branches: 85, functions: 90, lines: 90 }
      }
    }
  }
});
