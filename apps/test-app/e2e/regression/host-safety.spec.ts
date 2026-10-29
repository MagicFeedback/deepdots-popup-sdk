import { test, expect, SDK } from './fixtures';

/**
 * MF-3245 · el host manda. Con el popup oculto, cargando o roto, la tienda sigue respondiendo a
 * clics reales (Playwright no hace click si otro elemento tapa el destino) y se puede navegar.
 */

test.describe(`SDK ${SDK} · host safety`, () => {
  // Failure test obligatorio de MF-3197 (web): una capa invisible del popup se come los clics.
  // Un popup en una esquina no tiene velo: el resto de la página tiene que seguir siendo del host.
  for (const pos of ['bottom-right', 'top-left'] as const) {
    test(`popup en esquina (${pos}): fuera de la tarjeta, los clics llegan al host`, async ({ rlab, page }) => {
      rlab.expectPopups('lab-help-click-es');
      await rlab.open('/account', { scenario: 'help-click', pos });
      await rlab.knownBug('corner-overlay');
      await page.getByTestId('help-button').click();
      await rlab.expectPopupShown('lab-help-click-es');
      const intercepted = await rlab.interceptedPoints(12, 12);
      expect(intercepted, 'points where an invisible layer eats the click').toEqual([]);
      // Clic real, con el popup abierto, en un enlace del host que la tarjeta no tapa (en móvil
      // la tarjeta es grande y según la esquina cubre unos u otros): la tienda navega.
      const card = await rlab.popupBox();
      const links = [
        { el: page.getByTestId('nav-cart'), url: /\/cart/ },
        { el: page.getByTestId('nav-account'), url: /\/account/ },
        { el: page.locator('.site-header .logo'), url: /localhost:\d+\/(\?|$)/ },
      ];
      let target: (typeof links)[number] | undefined;
      for (const link of links) {
        const b = await link.el.boundingBox();
        const overlaps = b && b.x < card.x + card.width && b.x + b.width > card.x && b.y < card.y + card.height && b.y + b.height > card.y;
        if (b && !overlaps && !(await page.url()).match(link.url)) {
          target = link;
          break;
        }
      }
      if (!target) {
        // En móvil la tarjeta mide hasta el 90 % del alto y tapa toda la cabecera: queda la
        // rejilla de arriba (las franjas del host fuera de la tarjeta), sin clic de navegación.
        test.info().annotations.push({ type: 'note', description: 'no host link outside the card at this viewport' });
        return;
      }
      await target.el.click({ timeout: 3_000 });
      await expect(page).toHaveURL(target.url);
      await expect(rlab.popup).toBeVisible();
    });
  }

  test('tras cerrar un popup en esquina no queda ninguna capa', async ({ rlab, page }) => {
    rlab.expectPopups('lab-help-click-es');
    await rlab.open('/account', { scenario: 'help-click', pos: 'bottom-left' });
    await page.getByTestId('help-button').click();
    await rlab.expectPopupShown('lab-help-click-es');
    await rlab.closePopup();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.expectHostUsable();
  });

  test('encuesta lenta: mientras carga el host responde, y si se cierra no reaparece al llegar', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await page.clock.install();
    await rlab.open('/products/42', { scenario: 'rate-product', fault: 'slow' });
    await rlab.popupsLoaded();
    // Reloj parado: el techo de espera del popup (1,2 s) no vence mientras se comprueba el host.
    // `force` salta la espera de frames de Playwright (parada con el reloj), pero el clic sigue
    // siendo un evento de ratón real en esas coordenadas: si una capa lo tapa, se lo queda ella.
    await rlab.freeze();
    const count = page.getByTestId('cart-count');
    await page.getByTestId('rate-product').click({ force: true });
    // Durante la espera el contenedor está montado pero invisible y sin capturar clics.
    expect(await rlab.interceptedPoints()).toEqual([]);
    await page.getByTestId('add-to-cart').click({ force: true });
    await expect(count).toHaveText('1');
    await rlab.resume();
    // Pasado el techo de espera el popup se abre con el spinner; se cierra antes de que llegue.
    await rlab.expectPopupShown('lab-rate-product-es');
    await rlab.closePopup();
    // La encuesta llega (4 s en el service worker) con el popup ya cerrado.
    await expect.poll(async () => (await rlab.network()).some((n) => n.path.includes('/sdk/app/') && n.status === 200), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(800);
    await expect(rlab.popup).toBeHidden();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.expectHostUsable();
  });

  test('sin red (offline) al abrir: el popup avisa, se cierra y la SPA sigue navegando', async ({ rlab, page, context }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product' });
    await rlab.popupsLoaded();
    // La red cae con el SDK ya listo: definiciones cargadas y el chunk del renderer precargado.
    // (Si cae ANTES de la precarga es otro caso: el test de `fault=chunk` de abajo.)
    await expect
      .poll(async () => (await rlab.network()).some((n) => /\/renderPopup-/.test(n.path) && n.status === 200), { message: 'renderer chunk preloaded' })
      .toBe(true);
    await context.setOffline(true);
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
    await expect(rlab.popup.getByRole('alert')).toBeVisible();
    await rlab.closePopup();
    await rlab.expectHostUsable();
    await context.setOffline(false);
  });

  test('el chunk del renderer no se descarga: sin errores en la página, y el SDK no se queda bloqueado', async ({ rlab, page }) => {
    // Dos disparos del mismo evento: los dos tienen que intentarse (el renderer no puede quedarse
    // creyendo que hay un popup abierto) y ninguno puede dejar un error sin capturar en la página.
    rlab.expectPopups('lab-rate-product-es', 'lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product', fault: 'chunk' });
    await rlab.popupsLoaded();
    await rlab.knownBug('chunk-load-failure');
    await page.getByTestId('rate-product').click();
    await expect
      .poll(async () => (await rlab.network()).filter((n) => /\/renderPopup-/.test(n.path)).length, { message: 'renderer chunk requested' })
      .toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await page.getByTestId('rate-product').click();
    await page.waitForTimeout(500);
    await expect(rlab.popup).toBeHidden();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.expectHostUsable();
  });

  test('la API de popups no contesta nunca: ni popup ni bloqueo', async ({ rlab, page }) => {
    rlab.expectPopups();
    await rlab.open('/products/42', { scenario: 'rate-product', fault: 'popups-timeout' });
    await page.getByTestId('rate-product').click();
    await rlab.expectNoPopupFor(2_000);
    await rlab.expectHostUsable();
  });

  test('errores 500 en eventos y respuestas: el popup avisa al enviar y el host sigue', async ({ rlab, page }) => {
    rlab.expectPopups('lab-help-click-es');
    await rlab.open('/account', { scenario: 'help-click', fault: 'events500' });
    await page.getByTestId('help-button').click();
    await rlab.expectPopupShown('lab-help-click-es');
    // En táctil el primer toque puede caer mientras la página entra (animación): se reintenta
    // hasta que el envío llega a la API y el popup enseña el aviso.
    const alert = rlab.popup.getByRole('alert');
    await expect(async () => {
      await rlab.popup.locator('label[for="rating-nps-7"]').click();
      const send = rlab.popup.getByRole('button', { name: /^(Enviar|Send)$/ });
      if (await send.isVisible()) await send.click();
      await expect(alert).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    expect((await rlab.network()).filter((n) => n.status === 500).length).toBeGreaterThan(0);
    await rlab.closePopup();
    await rlab.expectHostUsable();
  });

  test('encuesta a medio pintar (respuesta corrupta): el popup se puede cerrar y el host sigue', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product', fault: 'survey-garbage' });
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
    await rlab.closePopup();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.expectHostUsable();
  });

  test('ráfaga de navegación con popups de por medio: la tienda sigue respondiendo', async ({ rlab, page }) => {
    // Escenario `all`: tiempo, exit, clic y re-display a la vez. Lo que salga se cierra; lo que
    // se comprueba es que tras la ráfaga no queda ninguna capa y la tienda responde.
    await rlab.open('/', { scenario: 'all' });
    await rlab.popupsLoaded();
    for (let i = 0; i < 4; i++) {
      for (const path of ['/checkout', '/account', '/products/42', '/cart']) await rlab.navigate(path);
    }
    await page.waitForTimeout(3_500);
    for (let i = 0; i < 3 && (await rlab.popup.isVisible()); i++) await rlab.closePopup();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.navigate('/');
    await rlab.expectHostUsable();
  });
});
