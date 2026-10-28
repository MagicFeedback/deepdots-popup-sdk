import { test, expect, SDK } from './lab';

/**
 * Failure tests obligatorios de MF-3196:
 *  1. Falta un evento de navegación → el test detecta que el trigger no salta.
 *  2. Falla la carga del popup (406, error de red, SDK caído) → la tienda sigue usable.
 */

test.describe(`SDK ${SDK} · missing navigation event`, () => {
  // Mismo flujo que el test de `exit` del smoke, pero el router del host cambia la vista sin
  // avisar (?nav=silent: sin History API, como un router en memoria o una app que no llama a
  // setScreen/setPath). El SDK no se entera de que el usuario salió de /checkout.
  //
  // `test.fail()`: Playwright espera que la aserción de `expectPopupShown` FALLE. Si un día el
  // popup saliera aun así (el test dejaría de detectar el hueco), este test se pondría en rojo.
  test('sin evento de navegación, el exit trigger no salta y el test lo detecta', async ({ lab, page }) => {
    test.fail(true, 'expected: the exit popup never shows because the route change is invisible to the SDK');
    await lab.open('/checkout', { scenario: 'exit-checkout', nav: 'silent' });
    await page.waitForTimeout(500);
    await lab.clickNav('nav-account');
    // La vista cambió (el usuario ve "Mi cuenta") pero la URL sigue en /checkout.
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
    await lab.expectPopupShown('lab-exit-checkout-es', 6_000);
  });

  test('control: con navegación normal el mismo flujo sí lo muestra', async ({ lab, page }) => {
    await lab.open('/checkout', { scenario: 'exit-checkout', nav: 'history' });
    await page.waitForTimeout(500);
    await lab.clickNav('nav-account');
    await lab.expectPopupShown('lab-exit-checkout-es', 6_000);
  });
});

test.describe(`SDK ${SDK} · popup load failure keeps the host usable`, () => {
  for (const fault of ['survey406', 'network'] as const) {
    test(`encuesta con ${fault}: el popup avisa, se cierra y la tienda sigue funcionando`, async ({ lab, page }) => {
      await lab.open('/products/42', { scenario: 'rate-product', fault });
      await page.getByTestId('rate-product').click();
      await lab.expectPopupShown('lab-rate-product-es');
      const survey = (await lab.network()).filter((n) => n.path.startsWith('/sdk/app/'));
      expect(survey.length).toBeGreaterThan(0);
      expect(survey.every((n) => n.note?.startsWith('fault injected'))).toBe(true);
      await expect(lab.popup.getByRole('alert')).toBeVisible();
      await lab.closePopup();
      await lab.expectHostUsable();
    });
  }

  test('GET de popups con 500: no sale ningún popup y la tienda sigue funcionando', async ({ lab, page }) => {
    await lab.open('/products/42', { scenario: 'rate-product', fault: 'popups500' });
    await page.getByTestId('rate-product').click();
    await lab.expectNoPopupFor(2_000);
    await lab.expectHostUsable();
  });

  test('el SDK no llega a cargar (CDN caído): la tienda sigue funcionando', async ({ lab, page }) => {
    test.skip(SDK === 'local', 'la build local no sale del CDN');
    await lab.open('/products/42', { scenario: 'rate-product', fault: 'sdk-cdn' });
    expect(await page.evaluate(() => (window as any).__lab.sdkError)).toBeTruthy();
    await page.getByTestId('rate-product').click();
    await lab.expectHostUsable();
  });
});
