import { defineConfig, devices } from '@playwright/test';

// Regresión visual del popup (DD-28). Solo HACE las capturas (en `out/actual/<device>/`); la
// comparación con las referencias aprobadas la hace después scripts/visual/check.mjs. Ver README.md.
//
// ⚠️ Las referencias se generan en la imagen Docker oficial de Playwright (la misma versión que
// @playwright/test del lockfile): fuera de ella el renderizado de fuentes cambia y todo diferiría.
// En local: `npm run test-app:visual:docker`.
//
// Un proyecto por device; el nombre del proyecto es la carpeta de las capturas y de las
// referencias, así que NO se renombra sin volver a aprobar.
const PORT = Number(process.env.TEST_APP_PORT ?? 5180);
const SDK = process.env.SDK_VERSION ?? 'local';

const chromium = { browserName: 'chromium' as const, locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'light' as const };

export default defineConfig({
  testDir: '.',
  testMatch: /\.visual\.ts$/,
  outputDir: './out/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './out/playwright-report', open: 'never' }]],
  globalTeardown: './meta.ts',
  metadata: { sdk: SDK },
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'off' },
  projects: [
    { name: 'web-desktop', use: { ...devices['Desktop Chrome'], ...chromium, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 } },
    // Pantalla pequeña: el ancho de un iPhone SE, en Chromium (Playwright solo da WebKit con su perfil).
    { name: 'web-mobile-small', use: { ...chromium, viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'web-mobile-pixel7', use: { ...devices['Pixel 7'], ...chromium } },
  ],
  webServer: {
    command: `node ../server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/app/params.js`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
