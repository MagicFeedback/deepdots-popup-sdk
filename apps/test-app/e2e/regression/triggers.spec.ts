import { test, expect, SDK } from './fixtures';

/**
 * MF-3245 · triggers: tiempo y scroll con reloj falso, y disparos duplicados o concurrentes.
 * Lo que se cuenta es lo que ve el backend y el usuario: `popup_shown`, POST SHOWED y tarjetas
 * del popup en el DOM.
 */

test.describe(`SDK ${SDK} · triggers`, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test('time_on_page 3 s: a los 2 s no ha salido y a los 3,5 s sí', async ({ rlab, page }) => {
    rlab.expectPopups('lab-checkout-time-es');
    await rlab.open('/checkout', { scenario: 'checkout-time' });
    await rlab.popupsLoaded();
    await rlab.freeze();
    await rlab.advance(2_000);
    await page.waitForTimeout(300);
    expect(await rlab.shownPopups()).toEqual([]);
    await rlab.advance(1_500);
    await rlab.resume();
    await rlab.expectPopupShown('lab-checkout-time-es');
  });

  test('scroll 50 %: al 30 % no sale y al pasar del 50 % sí, una sola vez', async ({ rlab, page }) => {
    rlab.expectPopups('lab-scroll-products-es');
    // Ventana baja para que el catálogo tenga recorrido de scroll (a 860 px cabe entero).
    await page.setViewportSize({ width: 1280, height: 480 });
    await rlab.open('/products', { scenario: 'scroll-products' });
    await rlab.popupsLoaded();
    await page.getByTestId('newsletter-close').click();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'scrollable range').toBeGreaterThan(200);
    const scrollTo = (ratio: number) =>
      page.evaluate((r) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * r), ratio);
    await scrollTo(0.3);
    await page.waitForTimeout(300);
    expect(await rlab.shownPopups()).toEqual([]);
    await scrollTo(0.8);
    await rlab.expectPopupShown('lab-scroll-products-es');
    await scrollTo(0.1);
    await scrollTo(0.9);
    await page.waitForTimeout(300);
  });

  test('click: doble clic en el botón de ayuda abre un solo popup', async ({ rlab, page }) => {
    rlab.expectPopups('lab-help-click-es');
    await rlab.open('/account', { scenario: 'help-click' });
    await rlab.popupsLoaded();
    await page.getByTestId('help-button').dblclick();
    await rlab.expectPopupShown('lab-help-click-es');
    await page.waitForTimeout(300);
    expect(await rlab.showedPosts()).toHaveLength(1);
  });

  test('evento del host repetido 5 veces seguidas: un popup, un popup_shown y un SHOWED', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product' });
    await rlab.popupsLoaded();
    await rlab.knownBug('duplicate-shown');
    for (let i = 0; i < 5; i++) await page.evaluate(() => (window as any).__lab.sdk.triggerEvent('rate_product'));
    await rlab.expectPopupShown('lab-rate-product-es');
    await page.waitForTimeout(500);
    await expect(page.locator('#deepdots-popup-container .deepdots-popup')).toHaveCount(1);
    expect(await rlab.shownPopups()).toEqual(['lab-rate-product-es']);
    expect(await rlab.showedPosts()).toHaveLength(1);
  });

  test('dos popups distintos a la vez: sale el primero y el segundo no cuenta como mostrado', async ({ rlab, page }) => {
    // help-click (clic) y redisplay (2 s en /account) en la misma página.
    rlab.expectPopups('lab-help-click-es');
    await rlab.open('/account', { scenario: 'all' });
    await rlab.popupsLoaded();
    await rlab.knownBug('phantom-shown');
    await page.getByTestId('help-button').click();
    await rlab.expectPopupShown('lab-help-click-es');
    await rlab.advance(3_000);
    await page.waitForTimeout(500);
    await expect(page.locator('#deepdots-popup-container .deepdots-popup')).toHaveCount(1);
    await expect(rlab.popup).toContainText('¿Te ayudamos?');
    expect(await rlab.shownPopups()).toEqual(['lab-help-click-es']);
    // El popup que no se pintó no puede gastar su cooldown: al cerrar el primero sigue disponible.
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('deepdots.popups.state') || '{}'));
    expect(Object.keys(state.lastShown ?? {})).toEqual(['lab-help-click-es']);
  });
});
