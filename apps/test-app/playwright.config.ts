import { defineConfig, devices } from '@playwright/test';

// Suite de la test app (MF-3243). Corre contra UNA versión del SDK por ejecución:
//   SDK_VERSION=latest | local | 1.16.1   (por defecto latest)
// El CI la lanza en matriz, una versión por job (.github/workflows/test-app.yml).
const PORT = Number(process.env.TEST_APP_PORT ?? 5180);
const SDK = process.env.SDK_VERSION ?? 'latest';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    ['json', { outputFile: './test-results/results.json' }],
  ],
  metadata: { sdk: SDK, env: 'DEV (api-dev.deepdots.com)' },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-ES',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.RECORD_VIDEO ? 'on' : 'retain-on-failure',
    viewport: { width: 1280, height: 860 },
  },
  projects: [{ name: `chromium · sdk ${SDK}`, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: `node server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/app/params.js`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
