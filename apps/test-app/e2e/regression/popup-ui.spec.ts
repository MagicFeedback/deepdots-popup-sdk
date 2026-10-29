import { test, expect, SDK } from './fixtures';

/**
 * MF-3245 · el popup visto desde el host: posición en escritorio y móvil (los dos proyectos de
 * Playwright), redimensionado con el popup abierto, cierre y envío de una respuesta.
 */

const POSITIONS = ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
/** Margen máximo entre la tarjeta y el borde al que está anclada (16 px de padding + holgura). */
const EDGE = 40;

test.describe(`SDK ${SDK} · popup UI`, () => {
  for (const pos of POSITIONS) {
    test(`posición ${pos}: dentro del viewport, anclado donde toca, y se cierra`, async ({ rlab, page }) => {
      rlab.expectPopups('lab-rate-product-es');
      await rlab.open('/products/42', { scenario: 'rate-product', pos });
      await page.getByTestId('rate-product').click();
      await rlab.expectPopupShown('lab-rate-product-es');
      await expect(rlab.popup.locator('label[for="rating-nps-9"], .magicfeedback-question, .magicfeedback-div').first()).toBeVisible();

      const vp = page.viewportSize()!;
      const box = await rlab.popupBox();
      expect(box.x, 'left edge').toBeGreaterThanOrEqual(0);
      expect(box.y, 'top edge').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(vp.width + 1);
      expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(vp.height + 1);

      const gapLeft = box.x;
      const gapRight = vp.width - (box.x + box.width);
      const gapTop = box.y;
      const gapBottom = vp.height - (box.y + box.height);
      if (pos.includes('left')) expect(gapLeft).toBeLessThanOrEqual(EDGE);
      else if (pos.includes('right')) expect(gapRight).toBeLessThanOrEqual(EDGE);
      else expect(Math.abs(gapLeft - gapRight), 'horizontally centred').toBeLessThanOrEqual(2);
      if (pos.startsWith('top')) expect(gapTop).toBeLessThanOrEqual(EDGE);
      else if (pos.startsWith('bottom')) expect(gapBottom).toBeLessThanOrEqual(EDGE);
      else expect(Math.abs(gapTop - gapBottom), 'vertically centred').toBeLessThanOrEqual(2);

      await rlab.closePopup();
      await expect(page.locator('#deepdots-popup-container .deepdots-popup')).toHaveCount(0);
    });
  }

  test('redimensionar con el popup abierto (escritorio → móvil → escritorio): sigue dentro y anclado', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product', pos: 'bottom-right' });
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
    for (const size of [{ width: 375, height: 667 }, { width: 1440, height: 900 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const b = await rlab.popupBox();
          return b.x >= 0 && b.y >= 0 && b.x + b.width <= size.width + 1 && b.y + b.height <= size.height + 1;
        }, { message: `popup inside ${size.width}x${size.height}` })
        .toBe(true);
      const b = await rlab.popupBox();
      expect(size.width - (b.x + b.width), `anchored right at ${size.width}`).toBeLessThanOrEqual(EDGE);
    }
  });

  test('cerrar con la X: no queda nada del popup que estorbe al host', async ({ rlab, page }) => {
    rlab.expectPopups('lab-rate-product-es');
    await rlab.open('/products/42', { scenario: 'rate-product' });
    await page.getByTestId('rate-product').click();
    await rlab.expectPopupShown('lab-rate-product-es');
    await rlab.closePopup();
    await expect(page.locator('#deepdots-popup-container')).toBeHidden();
    expect(await rlab.interceptedPoints()).toEqual([]);
    await rlab.expectHostUsable();
  });

  test('envío completo contra DEV: survey_completed y la respuesta llega a la integración de DEV', async ({ rlab, page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'una respuesta a DEV por versión basta (escritorio)');
    // La única prueba de la regresión que deja datos: una respuesta en la encuesta «SDK Test
    // App · Simple» de MAGICFEEDBACK_DEV (es lo que comprueba que el envío funciona de verdad).
    rlab.expectPopups('lab-help-click-es');
    await rlab.open('/account', { scenario: 'help-click', survey: 'dev' });
    await page.getByTestId('help-button').click();
    await rlab.expectPopupShown('lab-help-click-es');
    await rlab.answerSimpleSurvey(9, `MF-3245 regression · ${SDK}`);
    await expect.poll(async () => (await rlab.events()).some((e) => e.name === 'survey_completed'), { timeout: 15_000 }).toBe(true);
    const answers = await rlab.requests((n) => n.method === 'POST' && n.path === '/sdk/feedback' && !n.note);
    expect(answers.length, 'answers sent to DEV').toBeGreaterThan(0);
    expect(answers.every((n) => n.status === 200)).toBe(true);
    expect(answers.every((n: any) => n.host === 'api-dev.deepdots.com')).toBe(true);
    await rlab.closePopup();
    await rlab.expectHostUsable();
  });
});
