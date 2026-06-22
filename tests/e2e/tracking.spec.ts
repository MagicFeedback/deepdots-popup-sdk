import { test, expect } from '@playwright/test';

/**
 * E2E del tracking Fase 1 contra la build LOCAL (examples/e2e-tracking.html → ../dist).
 * Determinista: NoopPopupRenderer evita el CDN del survey; el backend se mockea con route.
 */

const FIXTURE = '/examples/e2e-tracking.html';

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`${FIXTURE}${query}`);
  await page.waitForFunction(() => (window as any).__sdkReady === true);
}

const getUserId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).deepdots.getUserId());
const getSessionId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).deepdots.getSessionId());

test.describe('Tracking Fase 1 (E2E)', () => {
  test('genera un user_id, lo persiste y lo reutiliza tras recargar', async ({ page }) => {
    await ready(page);

    const uid = await getUserId(page);
    expect(uid).toBeTruthy();

    // persistido bajo el namespace exacto
    const stored = await page.evaluate(() => localStorage.getItem('deepdots.user_id'));
    expect(stored).toBe(uid);
    const firstSeen = await page.evaluate(() => localStorage.getItem('deepdots.user.first_seen'));
    expect(firstSeen).toBeTruthy();

    // returning: mismo id tras recargar
    await page.reload();
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    expect(await getUserId(page)).toBe(uid);

    // sin backend (modo client sin apiKey) el session_id es null
    expect(await getSessionId(page)).toBeNull();
  });

  test('usa el userId del cliente sin persistirlo', async ({ page }) => {
    await ready(page, '?userId=cliente-123');

    expect(await getUserId(page)).toBe('cliente-123');
    const stored = await page.evaluate(() => localStorage.getItem('deepdots.user_id'));
    expect(stored).toBeNull();
  });

  test('setTrackingEnabled(false) anula ids y reactivar los restaura', async ({ page }) => {
    await ready(page);
    const uid = await getUserId(page);
    expect(uid).toBeTruthy();

    await page.evaluate(() => (window as any).deepdots.setTrackingEnabled(false));
    expect(await getUserId(page)).toBeNull();
    expect(await getSessionId(page)).toBeNull();

    await page.evaluate(() => (window as any).deepdots.setTrackingEnabled(true));
    expect(await getUserId(page)).toBe(uid);
  });

  test('la navegación SPA (History API) emite eventos page_view por analytics', async ({ page }) => {
    await ready(page);

    await page.evaluate(() => {
      history.pushState({}, '', '/producto/123');
      history.pushState({}, '', '/carrito');
    });

    const events = await page.evaluate(() =>
      (window as any).deepdots
        .previewAnalytics()
        .events.filter((e: any) => e.name === 'page_view')
        .map((e: any) => e.params.screen),
    );
    // se cierra la pantalla anterior al navegar; la ruta con id se normaliza a :id
    expect(events).toContain('/producto/:id');
  });

  test('NO envía sessionId en el body y cachea el sessionId de la respuesta del backend', async ({ page }) => {
    // mock del GET de definiciones de popups (los popups vienen SOLO de la API)
    await page.route('**/sdk/*/popups*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'p1', title: 't', message: '', triggers: [{ type: 'event', value: 'evt' }], surveyId: 's1', productId: 'pr1' },
        ]),
      });
    });
    // mock del POST de eventos: la respuesta trae el sessionId (el SDK no lo envía)
    await page.route('**/sdk/popups', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'srv-e2e-1' }),
      });
    });

    // registrar la espera del GET ANTES de navegar (la carga ocurre en init)
    const getResp = page.waitForResponse((r) => /\/sdk\/.+\/popups/.test(r.url()));
    await page.goto(`${FIXTURE}?apiKey=test-key`);
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    await getResp;
    await page.waitForTimeout(50); // deja que init resuelva la carga (.then) y registre p1
    expect(await getSessionId(page)).toBeNull();

    const reqPromise = page.waitForRequest((r) => r.url().endsWith('/sdk/popups') && r.method() === 'POST');
    await page.evaluate(() => (window as any).showP1());
    const req = await reqPromise;

    // el body NO lleva sessionId; sí status/popupId/userId
    const body = JSON.parse(req.postData() || '{}');
    expect(body.sessionId).toBeUndefined();
    expect(body.status).toBe('SHOWED');
    expect(body.popupId).toBe('p1');

    // el SDK cachea el sessionId devuelto por el backend
    await expect.poll(() => getSessionId(page)).toBe('srv-e2e-1');
  });
});
