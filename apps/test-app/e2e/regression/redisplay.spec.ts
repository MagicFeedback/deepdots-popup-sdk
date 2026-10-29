import { test, expect, SDK, type RegressionLab } from './fixtures';

/**
 * MF-3245 · re-display (cooldowns) y segmentación. El reloj falso de Playwright mueve el
 * `Date.now()` del SDK: un día de cooldown se comprueba en milisegundos.
 */

const HOUR = 60 * 60 * 1000;

test.describe(`SDK ${SDK} · re-display and audience`, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  /** Recarga la página (mismo reloj falso, mismo localStorage) y espera a los triggers. */
  async function reopen(rlab: RegressionLab) {
    await rlab.page.reload();
    await rlab.waitReady();
    await rlab.popupsLoaded();
  }

  test('cooldown SHOWED de 1 día: a las 23 h no vuelve y a las 25 h sí', async ({ rlab, page }) => {
    rlab.expectPopups('lab-redisplay-es');
    await rlab.open('/account', { scenario: 'redisplay' });
    await rlab.popupsLoaded();
    await rlab.advance(2_500);
    await rlab.expectPopupShown('lab-redisplay-es');
    await rlab.closePopup();

    await rlab.advance(23 * HOUR);
    await reopen(rlab);
    await rlab.advance(3_000);
    await page.waitForTimeout(300);
    expect(await rlab.shownPopups()).toEqual([]);

    await rlab.advance(2 * HOUR);
    await reopen(rlab);
    await rlab.advance(3_000);
    await rlab.expectPopupShown('lab-redisplay-es');
  });

  test('cooldown COMPLETED de 30 días: contestada no vuelve, y a los 31 días sí', async ({ rlab, page }) => {
    rlab.expectPopups('lab-checkout-time-es');
    await rlab.open('/checkout', { scenario: 'checkout-time' });
    await rlab.popupsLoaded();
    await rlab.advance(3_500);
    await rlab.expectPopupShown('lab-checkout-time-es');
    await rlab.answerSimpleSurvey();
    await expect.poll(async () => (await rlab.events()).some((e) => e.name === 'survey_completed')).toBe(true);

    await rlab.advance(29 * 24 * HOUR);
    await reopen(rlab);
    await rlab.advance(4_000);
    await page.waitForTimeout(300);
    expect(await rlab.shownPopups()).toEqual([]);

    await rlab.advance(2 * 24 * HOUR);
    await reopen(rlab);
    await rlab.advance(4_000);
    await rlab.expectPopupShown('lab-checkout-time-es');
  });

  test('dos pestañas: lo que vio la primera cuenta en la segunda (localStorage compartido)', async ({ rlab, page, context }) => {
    rlab.expectPopups('lab-redisplay-es');
    await rlab.open('/account', { scenario: 'redisplay' });
    await rlab.popupsLoaded();
    await rlab.advance(2_500);
    await rlab.expectPopupShown('lab-redisplay-es');

    const second = await context.newPage();
    await second.goto(page.url());
    await second.waitForFunction(() => (window as any).__lab?.ready === true);
    await second.clock.fastForward(3_000);
    await second.waitForTimeout(500);
    const shownInSecond = await second.evaluate(() =>
      (window as any).__lab.events.filter((e: any) => e.name === 'popup_shown').length,
    );
    expect(shownInSecond).toBe(0);
    await second.close();
  });

  test('segmentación: idioma y rutas excluidas a la vez (lang=en, not-on-cart)', async ({ rlab, page }) => {
    rlab.expectPopups('lab-not-on-cart-en');
    await rlab.open('/cart', { scenario: 'not-on-cart', lang: 'en' });
    await rlab.popupsLoaded();
    await rlab.advance(3_000);
    await page.waitForTimeout(300);
    expect(await rlab.shownPopups()).toEqual([]);
    // El trigger de tiempo ya venció en /cart: se recarga en una ruta permitida.
    await rlab.open('/account', { scenario: 'not-on-cart', lang: 'en' });
    await rlab.popupsLoaded();
    await rlab.advance(3_000);
    await rlab.expectPopupShown('lab-not-on-cart-en');
    await expect(rlab.popup).toContainText('Like what you see?');
  });
});
