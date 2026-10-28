import { readFileSync } from 'node:fs';
import { test, SDK } from './lab';

/**
 * Los fixtures del manifiesto de compatibilidad (release/compatibility.json, MF-3241) contra el
 * artefacto publicado: cada versión tiene que seguir aceptando y mostrando esas definiciones.
 * src/core/release-fixtures.test.ts hace lo mismo en unit test contra el código fuente; aquí se
 * prueba el paquete tal y como lo instala un cliente. Las encuestas de esos fixtures no existen
 * (surveyId inventados): lo que se comprueba es que el popup se muestra.
 */

type ManifestFixture = { id: string; path: string; trigger: { event: string; href?: string } };

const manifest = JSON.parse(
  readFileSync(new URL('../../../release/compatibility.json', import.meta.url), 'utf8'),
) as { fixtures: ManifestFixture[] };

test.describe(`SDK ${SDK} · release fixtures`, () => {
  for (const fixture of manifest.fixtures) {
    const popupId = JSON.parse(readFileSync(new URL(`../../../${fixture.path}`, import.meta.url), 'utf8'))[0].id as string;

    test(`${fixture.id}: se muestra con el evento ${fixture.trigger.event}`, async ({ lab, page }) => {
      const href = new URL(fixture.trigger.href ?? 'http://localhost/');
      // full-definition segmenta por lang en/da; el resto no mira el idioma.
      await lab.open(href.pathname, { scenario: 'release-fixtures', lang: 'en' });
      if (href.hash) {
        // Rutas con hash (/#/game). Sin la query del laboratorio: el candidato `/#/game` se
        // busca como subcadena del href y `/?sdk=…#/game` no lo contiene (las definiciones
        // ya están cargadas, así que el service worker ya no necesita la query).
        await page.evaluate((target) => history.replaceState({}, '', target), href.pathname + href.hash);
      }
      await page.evaluate((name) => (window as any).__lab.sdk.triggerEvent(name), fixture.trigger.event);
      await lab.expectPopupShown(popupId);
    });
  }
});
