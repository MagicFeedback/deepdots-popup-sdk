import { test, expect, type Page } from '@playwright/test';

/**
 * Recargar la página sigue en la misma sesión de analytics (Chromium real: `pagehide`,
 * `sessionStorage` y recarga de verdad, que happy-dom solo aproxima). El backend se mockea:
 * cada lote sin `sessionId` abre un registro `rec-N`.
 */

const FIXTURE = '/examples/e2e-tracking.html?analytics=int-e2e-resume';

type Body = { sessionId?: string; completed: boolean; feedback: { metadata: { key: string }[] } };

async function mockFeedbackApi(page: Page) {
  const bodies: Body[] = [];
  let opened = 0;
  await page.context().route('**/sdk/feedback', async (route) => {
    const body = route.request().postDataJSON() as Body;
    bodies.push(body);
    const sessionId = body.sessionId ?? `rec-${++opened}`;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId }) });
  });
  return bodies;
}

async function loadAndFlush(page: Page, bodies: Body[], reload = false) {
  const before = bodies.length;
  if (reload) await page.reload();
  else await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as any).__sdkReady === true);
  await page.evaluate(() => (window as any).deepdots.flushAnalytics());
  await expect.poll(() => bodies.length).toBeGreaterThan(before);
  return bodies[bodies.length - 1];
}

const keys = (b: Body) => b.feedback.metadata.map((m) => m.key);

test.describe('Sesión de analytics tras recargar (E2E)', () => {
  test('una recarga sigue en el mismo registro, sin cerrar ni abrir sesión', async ({ page }) => {
    const bodies = await mockFeedbackApi(page);

    const first = await loadAndFlush(page, bodies);
    expect(first.sessionId).toBeUndefined();
    expect(keys(first)).toContain('deepdots_session_start');

    // El lote del `pagehide` (con `deepdots_session_suspend`) sale con keepalive y puede llegar
    // al mock DESPUÉS de que empiece la recarga: no vale "el último lote", hay que buscar el
    // que manda la página recargada.
    await loadAndFlush(page, bodies, true);
    await expect
      .poll(() => bodies.find((b) => keys(b).includes('deepdots_session_resume')))
      .toBeTruthy();
    const afterReload = bodies.find((b) => keys(b).includes('deepdots_session_resume'))!;
    expect(afterReload.sessionId).toBe('rec-1');
    expect(keys(afterReload)).not.toContain('deepdots_session_start');

    expect(bodies.some((b) => b.completed)).toBe(false);
    expect(bodies.slice(1).every((b) => b.sessionId === 'rec-1')).toBe(true);
  });

  test('otra pestaña no hereda la sesión suspendida', async ({ page }) => {
    const bodies = await mockFeedbackApi(page);
    await loadAndFlush(page, bodies);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    const other = await page.context().newPage();
    const fromOtherTab = await loadAndFlush(other, bodies);
    expect(fromOtherTab.sessionId).toBeUndefined();
    expect(keys(fromOtherTab)).toContain('deepdots_session_start');
  });
});
