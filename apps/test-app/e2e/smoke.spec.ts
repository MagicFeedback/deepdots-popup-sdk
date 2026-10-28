import { test, expect, SDK } from './lab';

/**
 * Smoke de la test app contra el SDK PUBLICADO (o la build local), una versión por ejecución.
 * Cubre los tipos de popup del alcance de MF-3196: tiempo, ruta, salida, evento, clic,
 * re-display, segmentación por idioma y por ruta, encuesta simple y compleja.
 */

test.describe(`SDK ${SDK} · smoke`, () => {
  test('carga la versión pedida, en DEV, y lo deja en el log del run', async ({ lab, page }) => {
    await lab.open('/', { scenario: 'checkout-time' });
    const version = await lab.sdkVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    await expect(page.getByTestId('lab-version')).toContainText(version!);
    await expect(page.getByTestId('lab-env')).toHaveText(/DEV · api-dev\.deepdots\.com/);
    const loaded = (await lab.events()).find((e) => e.name === 'loaded');
    expect(loaded?.data).toContain(version!);
    // Popups pedidos a DEV, no a producción.
    expect((await lab.network()).some((n) => n.host === 'api-dev.deepdots.com' && n.path.endsWith('/popups'))).toBe(true);
  });

  test('time_on_page + path: el popup sale a los 3 s en /checkout y carga la encuesta de DEV', async ({ lab }) => {
    await lab.open('/checkout', { scenario: 'checkout-time' });
    await lab.expectPopupShown('lab-checkout-time-es');
    await expect(lab.popup).toContainText('¿Algo te ha impedido terminar la compra?');
    await expect(lab.popup.getByText('¿Qué probabilidad hay de que recomiendes NORDLY')).toBeVisible();
    const survey = (await lab.network()).find((n) => n.path.startsWith('/sdk/app/'));
    expect(survey?.status).toBe(200);
  });

  test('path targeting: el mismo popup NO sale fuera de /checkout', async ({ lab }) => {
    await lab.open('/products', { scenario: 'checkout-time' });
    await lab.expectNoPopupFor(5_000);
  });

  test('exit: al salir de /checkout sale el popup en la ruta de destino', async ({ lab, page }) => {
    // FAILURE TEST (MF-3243): el host cambia de pantalla SIN emitir el evento de navegación
    // (nav=silent: ni pushState ni popstate). Este test debe ponerse en rojo.
    await lab.open('/checkout', { scenario: 'exit-checkout', nav: 'silent' });
    await page.waitForTimeout(500);
    await lab.clickNav('nav-account');
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
    await lab.expectPopupShown('lab-exit-checkout-es');
    await expect(lab.popup).toContainText('¿Por qué has salido del checkout?');
  });

  test('event: «Valorar» dispara el evento del host y abre la encuesta compleja', async ({ lab, page }) => {
    await lab.open('/products/42', { scenario: 'rate-product' });
    await page.getByTestId('rate-product').click();
    await lab.expectPopupShown('lab-rate-product-es');
    await expect(lab.popup.getByText('¿Encontraste lo que buscabas?')).toBeVisible();
  });

  test('click: el botón de ayuda del footer abre su popup', async ({ lab, page }) => {
    await lab.open('/account', { scenario: 'help-click' });
    await page.getByTestId('help-button').click();
    await lab.expectPopupShown('lab-help-click-es');
  });

  test('re-display: con cooldown SHOWED no vuelve a salir tras recargar, y sí tras borrar el historial', async ({ lab, page }) => {
    await lab.open('/account', { scenario: 'redisplay' });
    await lab.expectPopupShown('lab-redisplay-es');
    await lab.closePopup();

    await page.reload();
    await page.waitForFunction(() => (window as any).__lab?.ready === true);
    await lab.expectNoPopupFor(4_000);

    await Promise.all([page.waitForEvent('load'), page.getByTestId('lab-reset').click()]);
    await page.waitForFunction(() => (window as any).__lab?.ready === true);
    await lab.expectPopupShown('lab-redisplay-es');
  });

  test('excludedPaths: no sale en /cart y sí en el resto', async ({ lab }) => {
    await lab.open('/cart', { scenario: 'not-on-cart' });
    await lab.expectNoPopupFor(4_000);
    await lab.open('/', { scenario: 'not-on-cart' });
    await lab.expectPopupShown('lab-not-on-cart-es');
  });

  test('CSS del host en conflicto y overlays: el popup se puede usar y cerrar', async ({ lab, page }) => {
    // /products abre además el modal de newsletter del host (z-index propio) y hay banner de cookies.
    await lab.open('/products/42', { scenario: 'rate-product' });
    await expect(page.getByTestId('cookie-banner')).toBeVisible();
    await page.getByTestId('rate-product').click();
    await lab.expectPopupShown('lab-rate-product-es');
    await lab.closePopup();
    await lab.expectHostUsable();
  });
});

test.describe(`SDK ${SDK} · multi-language`, () => {
  test.use({ locale: 'en-US' });

  test('lang=en: solo sale la variante inglesa, con la encuesta en inglés', async ({ lab, page }) => {
    await lab.open('/checkout', { scenario: 'checkout-time', lang: 'en' });
    await expect(page.getByRole('heading', { name: 'Shipping details' })).toBeVisible();
    await lab.expectPopupShown('lab-checkout-time-en');
    expect(await lab.shownPopups()).not.toContain('lab-checkout-time-es');
    await expect(lab.popup).toContainText('Did anything stop you from completing your order?');
    await expect(lab.popup.getByText('How likely are you to recommend NORDLY')).toBeVisible();
  });

  test('el selector de idioma del host cambia la tienda y el popup', async ({ lab, page }) => {
    await lab.open('/products/42', { scenario: 'rate-product' });
    await Promise.all([page.waitForEvent('load'), page.getByTestId('lang-en').click()]);
    await page.waitForFunction(() => (window as any).__lab?.ready === true && (window as any).__lab.params.lang === 'en');
    await expect(page.getByTestId('add-to-cart')).toHaveText('Add to cart');
    await page.getByTestId('rate-product').click();
    await lab.expectPopupShown('lab-rate-product-en');
    await expect(lab.popup.getByText('Did you find what you were looking for?')).toBeVisible();
  });
});

test.describe(`SDK ${SDK} · known issues (host widgets)`, () => {
  // Hallazgo de MF-3243: el contenedor del popup va con z-index 999999 y los widgets de chat de
  // terceros (Intercom, Zendesk…) suelen ir en 2147483000. Un popup abajo a la derecha queda con
  // la X debajo de la burbuja de chat y el usuario no puede cerrarlo.
  // `test.fail()`: el día que el SDK lo arregle, este test se pondrá en rojo para quitar la marca.
  test('la burbuja de chat del host no tapa la X de un popup abajo a la derecha', async ({ lab, page }) => {
    test.fail(true, 'known issue: popup z-index 999999 < host chat widget');
    await lab.open('/account', { scenario: 'help-click' });
    await page.getByTestId('help-button').click();
    await lab.expectPopupShown('lab-help-click-es');
    await page.locator('#deepdots-popup-container #dd-close').click({ timeout: 3_000 });
  });
});

test.describe(`SDK ${SDK} · live DEV config`, () => {
  // Sin fixtures: los popups salen de la config "SDK Test App (MF-3243)" de MAGICFEEDBACK_DEV,
  // tal y como los serviría la API a un cliente.
  test('?popups=live: la API de DEV sirve la config de la test app y el popup sale', async ({ lab, page }) => {
    await lab.open('/products/42', { popups: 'live' });
    const popupsGet = async () => (await lab.network()).find((n) => /^\/sdk\/[^/]+\/popups$/.test(n.path));
    await expect.poll(async () => (await popupsGet())?.status).toBe(200);
    expect((await popupsGet())?.note ?? '').not.toContain('fixture');
    await page.getByTestId('rate-product').click();
    await expect(lab.popup).toContainText('Cuéntanos qué te parece este producto');
  });
});
