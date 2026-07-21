import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    // los tests E2E (Playwright) se ejecutan con `npm run e2e`, no con vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'RnSandbox/**'],
  },
});
