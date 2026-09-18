import { test, expect } from '@playwright/test';

/**
 * E2E de `segments.excludedPaths` contra la build LOCAL (dist), en un navegador real:
 * el popup se define "en todas las rutas menos /cart" y se comprueba navegando de verdad
 * con la History API, que es lo que alimenta la comparación de rutas.
 */

const FIXTURE = '/examples/e2e-tracking.html';

const POPUP = {
  id: 'p-cart',
  title: 't',
  message: '',
  triggers: [{ type: 'event', value: 'evt' }],
  surveyId: 's1',
  productId: 'pr1',
  segments: { lang: ['en'], path: ['/'], excludedPaths: ['/cart'] },
};

test('no se muestra en la ruta excluida y sí en el resto', async ({ page }) => {
  await page.route('**/sdk/*/popups*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([POPUP]) });
  });
  await page.route('**/sdk/popups', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'srv-e2e' }) });
  });

  const getResp = page.waitForResponse((r) => /\/sdk\/.+\/popups/.test(r.url()));
  await page.goto(`${FIXTURE}?apiKey=test-key`);
  await page.waitForFunction(() => (window as any).__sdkReady === true);
  await getResp;
  await page.waitForTimeout(50); // init resuelve la carga de definiciones en un .then

  await page.evaluate(() => {
    (window as any).__shown = [];
    (window as any).deepdots.on('popup_shown', (e: any) => (window as any).__shown.push(e.data?.popupId));
    (window as any).deepdots.autoLaunch();
  });

  const trigger = (path: string) =>
    page.evaluate((p) => {
      history.pushState({}, '', p);
      (window as any).deepdots.triggerEvent('evt');
      return (window as any).__shown.length;
    }, path);

  expect(await trigger('/cart')).toBe(0);
  expect(await trigger('/cart/summary')).toBe(0); // el prefijo también queda excluido
  expect(await trigger('/products')).toBe(1);
});
