import { defineConfig, devices } from '@playwright/test';

// Suite de la test app (MF-3243 smoke + MF-3245 regresión). Corre contra UNA versión del SDK
// por ejecución:
//   SDK_VERSION=latest | local | 1.16.1   (por defecto latest)
// El CI la lanza en matriz, una versión por job (.github/workflows/test-app.yml).
//
// Proyectos (el nombre sale en el reporte: plataforma + versión):
//   smoke               e2e/*.spec.ts, escritorio; va contra DEV, así que admite 1 reintento en CI
//   regression desktop  e2e/regression/**, escritorio; determinista (fixtures + reloj falso): 0 reintentos
//   regression mobile   posición y seguridad del host en un viewport de móvil (Pixel 7, táctil)
//   monitor             e2e/monitor/**, el monitor sintético (DD-26, monitor.yml): config REAL de DEV,
//                       1 reintento (un fallo solo cuenta si el reintento también falla). Solo corre
//                       con MONITOR=1; sin él no aparece en el CI de PRs ni en el de releases.
//
// ⚠️ Fuera del CI se reutiliza un servidor que ya esté en el puerto: si hay otra copia de la test
// app en el 5180 (otro checkout), la suite probaría ESA app. TEST_APP_PORT=5191 lo evita.
const PORT = Number(process.env.TEST_APP_PORT ?? 5180);
const SDK = process.env.SDK_VERSION ?? 'latest';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.RECORD_VIDEO ? 'on' : 'retain-on-failure',
    viewport: { width: 1280, height: 860 },
    // SLOWMO=400 para grabar demos que se puedan seguir a ojo (RECORD_VIDEO=1).
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },
  projects: process.env.MONITOR
    ? [
        {
          name: `monitor · web desktop chromium · sdk ${SDK}`,
          testMatch: /monitor\/.*\.spec\.ts$/,
          retries: 1,
          use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
        },
      ]
    : [
        {
          name: `smoke · web desktop chromium · sdk ${SDK}`,
          testIgnore: /(regression|monitor)\//,
          retries: process.env.CI ? 1 : 0,
          use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
        },
        {
          name: `regression · web desktop chromium · sdk ${SDK}`,
          testMatch: /regression\/.*\.spec\.ts$/,
          use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
        },
        {
          name: `regression · web mobile chromium (Pixel 7) · sdk ${SDK}`,
          testMatch: /regression\/(popup-ui|host-safety)\.spec\.ts$/,
          use: { ...devices['Pixel 7'] },
        },
      ],
  webServer: {
    command: `node server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/app/params.js`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
