import { test, expect, SDK } from './fixtures';

/**
 * MF-3245 · navegación de una SPA. El SDK web no tiene `setPath`: se entera de cada cambio de
 * ruta por la History API (pushState/popstate), que es lo que usa el router de NORDLY.
 */

test.describe(`SDK ${SDK} · navigation`, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test('pushState: llegar a /checkout antes de que venza el tiempo muestra el popup allí', async ({ rlab, page }) => {
    rlab.expectPopups('lab-checkout-time-es');
    await rlab.open('/products', { scenario: 'checkout-time' });
    await rlab.popupsLoaded();
    await rlab.freeze();
    await rlab.advance(1_000);
    await rlab.navigate('/checkout');
    await expect(page).toHaveURL(/\/checkout/);
    await rlab.advance(2_500);
    await rlab.resume();
    await rlab.expectPopupShown('lab-checkout-time-es');
  });

  test('salir de /checkout antes de que venza el tiempo: el popup no sale en otra ruta', async ({ rlab, page }) => {
    rlab.expectPopups();
    await rlab.open('/checkout', { scenario: 'checkout-time' });
    await rlab.popupsLoaded();
    await rlab.freeze();
    await rlab.advance(1_000);
    await rlab.navigate('/products');
    await rlab.advance(5_000);
    await page.waitForTimeout(500);
    await expect(rlab.popup).toBeHidden();
  });

  test('atrás del navegador (popstate) desde /checkout dispara el exit en la ruta anterior', async ({ rlab, page }) => {
    rlab.expectPopups('lab-exit-checkout-es');
    await rlab.open('/products', { scenario: 'exit-checkout' });
    await rlab.popupsLoaded();
    await rlab.navigate('/checkout');
    await page.goBack();
    await expect(page).toHaveURL(/\/products/);
    await rlab.advance(2_500);
    await rlab.expectPopupShown('lab-exit-checkout-es');
  });

  test('ida y vuelta a /checkout antes del retraso del exit: no sale (el usuario volvió)', async ({ rlab, page }) => {
    rlab.expectPopups();
    await rlab.open('/checkout', { scenario: 'exit-checkout' });
    await rlab.popupsLoaded();
    await rlab.freeze();
    await rlab.navigate('/account');
    await rlab.navigate('/checkout');
    await rlab.advance(4_000);
    await page.waitForTimeout(500);
    await expect(rlab.popup).toBeHidden();
  });

  // Failure test obligatorio de MF-3197 (web): trigger duplicado durante una navegación rápida.
  // Se sale de /checkout tres veces en menos de un segundo: el exit se encola tres veces y tiene
  // que salir UN popup, con UN popup_shown y UN SHOWED.
  test('navegación rápida saliendo varias veces de /checkout: un solo popup de exit', async ({ rlab, page }) => {
    rlab.expectPopups('lab-exit-checkout-es');
    await rlab.open('/checkout', { scenario: 'exit-checkout' });
    await rlab.popupsLoaded();
    await rlab.knownBug('duplicate-shown');
    for (const path of ['/account', '/checkout', '/products', '/checkout', '/cart']) {
      await rlab.navigate(path);
      await rlab.advance(150);
    }
    await expect(page).toHaveURL(/\/cart/);
    await rlab.advance(3_000);
    await rlab.expectPopupShown('lab-exit-checkout-es');
    await rlab.advance(3_000);
    await page.waitForTimeout(500);
    expect(await rlab.shownPopups()).toEqual(['lab-exit-checkout-es']);
    expect(await rlab.showedPosts()).toHaveLength(1);
    await expect(page.locator('#deepdots-popup-container .deepdots-popup')).toHaveCount(1);
  });

  test('con un popup abierto, el host sigue navegando (atrás del navegador)', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products', { scenario: 'rate-product' });
    await rlab.navigate('/products/42');
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
    await page.goBack();
    await expect(page).toHaveURL(/\/products(\?|$)/);
    await expect(page.getByTestId('view')).not.toContainText(/Valorar/);
    await rlab.closePopup();
    // /products abre el modal de newsletter del host: se cierra y se sigue usando la tienda.
    await page.getByTestId('newsletter-close').click();
    await rlab.navigate('/');
    await rlab.expectHostUsable();
  });
});
