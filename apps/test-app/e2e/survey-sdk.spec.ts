import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, SDK } from './lab';

/**
 * DD-70 · gate de versiones de survey SDK. El popup pinta cada survey con la versión de
 * `@magicfeedback/native` asignada en el Admin (`surveyFrontend.sdkVersion`), pero solo si está en
 * `SUPPORTED_SURVEY_SDK_VERSIONS`. Este spec prueba TODAS las de la lista: si una no carga (JS o
 * CSS), no se pinta o no deja responder, falla "Smoke + regression · SDK local", que es check
 * obligatorio de la PR de release, y la versión no se publica.
 *
 * `?surveySdk=<v>` hace que el service worker ponga esa versión en cada popup (sw.js).
 * Solo aplica a SDKs que conocen el campo: `local` y publicados desde 1.19.0.
 */

const SOURCE = fileURLToPath(new URL('../../../src/ui/surveySdkVersion.ts', import.meta.url));
const source = readFileSync(SOURCE, 'utf8');
const list = /SUPPORTED_SURVEY_SDK_VERSIONS = \[([^\]]*)\]/.exec(source);
const bundled = /BUNDLED_SURVEY_SDK_VERSION = '([^']+)'/.exec(source)?.[1];
const VERSIONS = (process.env.SURVEY_SDK_VERSIONS?.split(/\s+/).filter(Boolean))
  ?? [...(list?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

const knowsTheField = SDK === 'local' || (() => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(SDK);
  return !!m && (Number(m[1]) > 1 || (Number(m[1]) === 1 && Number(m[2]) >= 19));
})();

test.describe(`SDK ${SDK} · survey SDK versions (DD-70)`, () => {
  test.skip(!knowsTheField, 'this popup SDK predates surveyFrontend.sdkVersion (DD-70)');

  test('la lista de versiones se lee del código', () => {
    expect(VERSIONS.length).toBeGreaterThan(0);
    expect(bundled).toMatch(/^\d+\.\d+\.\d+$/);
  });

  for (const version of VERSIONS) {
    test(`${version}: JS y CSS de esa versión, el survey se pinta y se responde`, async ({ lab, page }) => {
      await lab.open('/checkout', { scenario: 'checkout-time', surveySdk: version });
      await lab.expectPopupShown('lab-checkout-time-es');

      const source = version === bundled ? 'bundled' : 'assigned';
      await expect(lab.popup).toHaveAttribute('data-survey-sdk', `${version} ${source}`);
      // La hoja del survey es la de esa versión (la vendorizada lo dice en su cabecera).
      const css = await page.evaluate(() => document.getElementById('magicfeedback-sdk-styles')?.textContent ?? '');
      expect(css).toContain(`Copia de @magicfeedback/native@${version}`);
      if (source === 'assigned') {
        const net = await lab.network();
        expect(net.some((n) => n.url.includes(`@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`) && n.status === 200)).toBe(true);
      }

      // Se pinta y deja responder: la primera pregunta (NPS) avanza a la siguiente.
      const first = lab.popup.getByText('¿Qué probabilidad hay de que recomiendes NORDLY');
      await expect(first).toBeVisible();
      await lab.popup.locator('.magicfeedback-rating-number-option, .magicfeedback-rating-number label').filter({ hasText: /^9$/ }).first().click();
      const send = lab.popup.getByRole('button', { name: /Enviar|Send/ });
      if (await send.isVisible().catch(() => false)) await send.click();
      await expect(lab.popup.getByText('¿Qué podríamos mejorar?')).toBeVisible({ timeout: 15_000 });
      // El aviso de error de carga existe siempre en el DOM; tiene que seguir oculto.
      for (const el of await lab.popup.locator('#deepdots-load-error, .deepdots-load-error').all()) await expect(el).toBeHidden();
    });
  }
});
