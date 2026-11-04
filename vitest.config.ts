import { defineConfig } from 'vitest/config';
import { sdkVersionDefine } from './scripts/sdk-version-define.mjs';

export default defineConfig({
  define: sdkVersionDefine('web'),
  test: {
    globals: true,
    environment: 'happy-dom',
    // los tests E2E (Playwright) se ejecutan con `npm run e2e`, no con vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'apps/**', 'RnSandbox/**'],
  },
});
