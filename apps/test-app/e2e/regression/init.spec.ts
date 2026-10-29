import { test, expect, SDK } from './fixtures';

/** MF-3245 · init y repeated init: el SDK arranca una vez aunque el host lo llame varias. */

test.describe(`SDK ${SDK} · init`, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test('un init: un solo GET de popups y el trigger de tiempo funciona', async ({ rlab }) => {
    rlab.expectPopups('lab-checkout-time-es');
    await rlab.open('/checkout', { scenario: 'checkout-time' });
    await rlab.popupsLoaded();
    await rlab.advance(3_500);
    await rlab.expectPopupShown('lab-checkout-time-es');
    expect(await rlab.popupsGets()).toHaveLength(1);
  });

  test('init + autoLaunch dos veces (StrictMode): un GET, un popup y un solo SHOWED', async ({ rlab }) => {
    rlab.expectPopups('lab-checkout-time-es');
    await rlab.open('/checkout', { scenario: 'checkout-time', init: 'twice' });
    await rlab.popupsLoaded();
    await rlab.advance(3_500);
    await rlab.expectPopupShown('lab-checkout-time-es');
    await rlab.advance(5_000);
    expect(await rlab.popupsGets()).toHaveLength(1);
    expect(await rlab.showedPosts()).toHaveLength(1);
    await expect(rlab.page.locator('#deepdots-popup-container')).toHaveCount(1);
  });

  test('carga tras el consentimiento de cookies: los triggers funcionan desde ese momento', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.goto('/products/42', { scenario: 'rate-product', load: 'consent' });
    await expect(page.getByTestId('cookie-banner')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__lab.sdk)).toBeFalsy();
    await page.getByTestId('cookie-accept').click();
    await rlab.waitReady();
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
  });

  test('evento del host antes de que lleguen las definiciones: se guarda y sale al cargar', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product', fault: 'popups-slow' });
    await page.getByTestId('rate-product').click();
    // La API tarda 3 s (tiempo real, en el service worker): el popup sale después, una vez.
    await rlab.expectPopupShown('lab-rate-product-es', 15_000);
  });
});
