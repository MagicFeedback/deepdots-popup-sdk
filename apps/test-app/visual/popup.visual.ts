import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * DD-28 · capturas del popup para la regresión visual. Cada test recorre un flujo y guarda una
 * captura por estado en `out/actual/<device>/<estado>.png`; check.mjs las compara después con
 * las referencias aprobadas de `baselines/`.
 *
 * Contenido fijo: popups y encuestas son los fixtures del service worker (`popups=fixture`,
 * `survey=fixture`), y las respuestas se contestan en local: nada sale a DEV. CSS del host
 * `clean`: lo que se protege es el aspecto del popup (las fugas de CSS del host las cubre la
 * regresión funcional, host-safety.spec.ts).
 *
 * Lo que se oculta: la barra y el panel del Lab (versión del SDK, id de run, log), que no son
 * parte del host ni del popup. El resto de la tienda es estático.
 */

const SDK = process.env.SDK_VERSION ?? 'local';
const OUT = join(import.meta.dirname, 'out', 'actual');
const HIDE_LAB = '#lab-toolbar, #lab-devtools { visibility: hidden !important; }';

const popupOf = (page: Page) => page.locator('#deepdots-popup-container .deepdots-popup');

async function open(page: Page, path: string, params: Record<string, string>) {
  await page.addInitScript(() => {
    localStorage.setItem('nordly.consent', 'necessary');
    sessionStorage.setItem('lab.collapsed', '1');
  });
  const q = new URLSearchParams({ sdk: SDK, popups: 'fixture', survey: 'fixture', css: 'clean', ...params });
  await page.goto(`${path}?${q}`);
  await page.waitForFunction(() => (window as any).__lab?.ready === true, null, { timeout: 30_000 });
}

/** Espera a que el popup esté quieto: revelado, sin spinner, fuentes e imágenes cargadas. */
async function settle(page: Page) {
  const popup = popupOf(page);
  await expect(popup).toBeVisible();
  await expect(page.locator('#deepdots-popup-container')).not.toHaveCSS('visibility', 'hidden');
  await expect(popup.locator('.mf-spinner')).toBeHidden();
  // Entre páginas el survey no acepta toques (aria-busy + inert) hasta pintar la siguiente: un
  // clic en ese hueco se pierde (pasaba en la pantalla pequeña con las estrellas).
  await expect(popup.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => i.addEventListener('load', r, { once: true }))),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  // Las transiciones (barra de progreso 450 ms, entrada de la pregunta) las termina
  // `animations: 'disabled'` al capturar; este margen es para el layout del survey.
  await page.waitForTimeout(400);
}

async function shot(page: Page, state: string) {
  await settle(page);
  await page.mouse.move(0, 0); // sin :hover en lo último que se pulsó
  const file = join(OUT, test.info().project.name, `${state}.png`);
  mkdirSync(dirname(file), { recursive: true });
  const buf = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device', style: HIDE_LAB });
  writeFileSync(file, buf);
  await test.info().attach(state, { body: buf, contentType: 'image/png' });
}

/** Lo que dice el run sobre el device (va al meta.json del run, ver meta.ts). */
async function recordDevice(page: Page) {
  const p = test.info().project;
  const vp = page.viewportSize();
  const info = `Chromium ${page.context().browser()?.version()} · ${vp?.width}×${vp?.height} @${p.use.deviceScaleFactor ?? 1}x${p.use.isMobile ? ' · mobile/touch' : ''}`;
  const sdkVersion = await page.evaluate(() => (window as any).__lab?.sdkVersion ?? null);
  mkdirSync(join(OUT, p.name), { recursive: true });
  writeFileSync(join(OUT, p.name, 'device.json'), JSON.stringify({ device: p.name, info, sdkVersion, sdk: SDK }));
}

/**
 * Encuesta compleja (center, overlay): cada página, el error de obligatoria y el gracias.
 * `prefix` va delante de cada estado (DD-248: `dark-`, `appearance-dark-`…).
 */
async function complexFlow(page: Page, prefix = '', params: Record<string, string> = {}) {
  await open(page, '/products/42', { scenario: 'rate-product', ...params });
  await recordDevice(page);
  await page.getByTestId('rate-product').click();
  const popup = popupOf(page);
  await shot(page, `${prefix}complex-1-open`);

  await popup.getByRole('button', { name: 'Enviar' }).click();
  await expect(popup.getByText('Responde la pregunta obligatoria para continuar.')).toBeVisible();
  await shot(page, `${prefix}complex-1-required-error`);

  // RADIO: avanza sola al elegir. Página 2 = la más alta (estrellas + múltiple).
  await popup.getByText('En parte').click();
  await expect(popup.getByText('Valora la ficha de producto')).toBeVisible();
  await settle(page);
  await popup.locator('label[for="rating-pdp_stars-4"]').click();
  await expect(popup.locator('#rating-pdp_stars-4')).toBeChecked();
  await popup.getByText('Materiales').click();
  await expect(popup.getByRole('checkbox', { name: 'Materiales' })).toBeChecked();
  await shot(page, `${prefix}complex-2-selected`);

  await popup.getByRole('button', { name: 'Enviar' }).click();
  await expect(popup.getByText('¿Volverías a comprar en NORDLY?')).toBeVisible();
  await shot(page, `${prefix}complex-3-boolean-email`);

  await settle(page);
  await popup.getByText('Sí', { exact: true }).click(); // obligatoria
  await expect(popup.getByRole('radio', { name: 'Sí', exact: true })).toBeChecked();
  await popup.getByRole('button', { name: 'Enviar' }).click();
  await expect(popup.getByText('¿Algo más que quieras contarnos?')).toBeVisible();
  await settle(page);
  await popup.locator('textarea').fill('Todo bien, gracias.');
  await shot(page, `${prefix}complex-4-text`);

  await popup.getByRole('button', { name: 'Enviar' }).click();
  await expect(popup.getByRole('button', { name: 'Completar encuesta' })).toBeVisible();
  await shot(page, `${prefix}complex-5-thanks`);
}

/** Encuesta simple (bottom-right, sin overlay): NPS y la página de texto. */
async function simpleFlow(page: Page, prefix = '', params: Record<string, string> = {}) {
  await open(page, '/account', { scenario: 'help-click', ...params });
  await page.getByTestId('help-button').click();
  const popup = popupOf(page);
  await shot(page, `${prefix}simple-1-bottom-right`);

  await popup.locator('label[for="rating-nps-9"]').click(); // NPS avanza solo
  await expect(popup.locator('textarea')).toBeVisible();
  await settle(page);
  await popup.locator('textarea').fill('Más tallas, por favor.');
  await shot(page, `${prefix}simple-2-text`);
}

test.describe(`popup visual · sdk ${SDK}`, () => {
  test('complex survey (center, overlay): every page, validation error and thank-you', async ({ page }) => {
    await complexFlow(page);
  });

  test('simple survey (bottom-right, no overlay): NPS and the text page', async ({ page }) => {
    await simpleFlow(page);
  });

  for (const pos of ['top', 'bottom-left'] as const) {
    test(`position ${pos}`, async ({ page }) => {
      await open(page, '/account', { scenario: 'help-click', pos });
      await page.getByTestId('help-button').click();
      await shot(page, `simple-1-${pos}`);
    });
  }

  // DD-248 · modo oscuro (DD-236). Paso 1: un Style oscuro da textos claros solo (DD-238,
  // DD-247). Paso 2: appearance de la app con los colores `dark` opcionales del Style (DD-239,
  // DD-241); en claro esos colores se ignoran.
  test('dark Style: complex survey', async ({ page }) => {
    await complexFlow(page, 'dark-', { style: 'dark' });
  });

  test('dark Style: simple survey', async ({ page }) => {
    await simpleFlow(page, 'dark-', { style: 'dark' });
  });

  test('appearance dark with the Style dark colours', async ({ page }) => {
    await complexFlow(page, 'appearance-dark-', { style: 'dark-block', appearance: 'dark' });
  });

  test('appearance light ignores the Style dark colours', async ({ page }) => {
    await open(page, '/products/42', { scenario: 'rate-product', style: 'dark-block', appearance: 'light' });
    await page.getByTestId('rate-product').click();
    await shot(page, 'appearance-light-complex-1-open');
  });
});
