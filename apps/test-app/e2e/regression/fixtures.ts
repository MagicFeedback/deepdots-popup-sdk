import { test as labTest, expect, Lab, SDK, type LabParams } from '../lab';
import type { Page, TestInfo } from '@playwright/test';

/**
 * Base de la regresión funcional (MF-3245). Sobre la `Lab` de MF-3243 añade lo que cada test
 * comprueba siempre, aunque no lo diga:
 *
 *  - **Popups esperados.** Cada test declara qué popups tienen que salir (`rlab.expectPopups`),
 *    y al terminar se compara con los `popup_shown` reales: un popup de más, uno de menos o uno
 *    duplicado hacen fallar el test aunque sus pasos hayan ido bien.
 *  - **Errores sin capturar.** Un `pageerror` (excepción que llega a la página) es un fallo.
 *  - **Plataforma y versión** en el reporte: proyecto (escritorio/móvil), SDK cargado y entorno.
 *
 * La encuesta va por defecto con `survey=fixture` (grabada de DEV): la regresión no depende de
 * la red. Los tests que tienen que ir a DEV lo piden con `survey: 'dev'`.
 */

/**
 * Bugs reales del SDK que la suite detecta y que aún no están arreglados. Su test lleva
 * `test.fail()` mientras el bug exista en la versión probada: si un día pasa, se pone en rojo
 * para quitar la marca.
 *
 *  fixedIn: null       sin arreglar en ninguna versión
 *           'local'    arreglado en esta rama (la build local), aún sin publicar
 *           'X.Y.Z'    publicado: falla en las anteriores y pasa desde esa
 */
export const KNOWN_BUGS = {
  'corner-overlay': {
    // [failure test · do not merge] se declara arreglado SIN el arreglo: el test tiene que fallar.
    fixedIn: 'local' as string | null,
    summary: 'popup en esquina: el contenedor a pantalla completa (transparente) se come los clics del host',
  },
  'duplicate-shown': {
    fixedIn: null as string | null,
    summary: 'el mismo popup disparado otra vez mientras está abierto emite popup_shown y POST SHOWED de nuevo',
  },
  'phantom-shown': {
    fixedIn: null as string | null,
    summary: 'otro popup que toca con uno abierto emite popup_shown + SHOWED y gasta su cooldown sin pintarse',
  },
} as const;

export type KnownBug = keyof typeof KNOWN_BUGS;

function semverLt(a: string, b: string) {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  return false;
}

/** ¿Tiene `version` (la cargada) el bug? `local` = la build de esta rama. */
export function hasBug(bug: KnownBug, version: string | null) {
  const { fixedIn } = KNOWN_BUGS[bug];
  if (fixedIn === null) return true;
  if (SDK === 'local') return false;
  if (fixedIn === 'local') return true;
  return !version || semverLt(version, fixedIn);
}

export class RegressionLab extends Lab {
  expected: string[] | null = null;
  readonly pageErrors: string[] = [];

  constructor(page: Page, private readonly info: TestInfo) {
    super(page);
    page.on('pageerror', (err) => this.pageErrors.push(String(err?.stack || err)));
  }

  private hostPrepared = false;

  /**
   * Igual que `Lab.open`, con la encuesta de fixture por defecto. Además deja el host como lo
   * tendría un usuario que ya ha pasado por él: cookies contestadas (en móvil el banner tapa el
   * footer) y el panel del Lab plegado (en móvil ocupa media pantalla). Nada de esto toca el SDK.
   */
  async open(path: string, params: LabParams = {}) {
    if (!this.hostPrepared) {
      this.hostPrepared = true;
      await this.page.addInitScript(() => {
        try {
          localStorage.setItem('nordly.consent', 'necessary');
          sessionStorage.setItem('lab.collapsed', '1');
        } catch {
          /* ignore */
        }
      });
    }
    await super.open(path, { survey: 'fixture', ...params });
    return this;
  }

  /** Abre la tienda SIN esperar al SDK (`load=consent`: el SDK no carga hasta aceptar cookies). */
  async goto(path: string, params: LabParams = {}) {
    const q = new URLSearchParams({ sdk: SDK, survey: 'fixture', ...params });
    await this.page.goto(`${path}?${q}`);
  }

  async waitReady() {
    await this.page.waitForFunction(() => (window as any).__lab?.ready === true, null, { timeout: 30_000 });
  }

  /** Navegación del host por su router (lo mismo que un enlace interno, sin buscar el enlace). */
  async navigate(path: string) {
    await this.page.evaluate((p) => (window as any).__labNavigate(p), path);
  }

  /** Peticiones vistas por el service worker que cumplen `filter`. */
  async requests(filter: (n: { method: string; path: string; status: number; note?: string }) => boolean) {
    return (await this.network()).filter(filter);
  }

  popupsGets() {
    return this.requests((n) => n.method === 'GET' && /^\/sdk\/[^/]+\/popups$/.test(n.path));
  }

  showedPosts() {
    return this.requests((n) => n.method === 'POST' && n.path === '/sdk/popups');
  }

  /** Contesta la encuesta simple: NPS (auto-avanza) → texto → Enviar. */
  async answerSimpleSurvey(nps = 9, text = 'MF-3245 regression') {
    await this.popup.locator(`label[for="rating-nps-${nps}"]`).click();
    const textarea = this.popup.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(text);
    await this.popup.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
  }

  /**
   * Como `Lab.expectHostUsable`, pero solo con controles que existen también en móvil (allí el
   * menú principal se oculta): logo → «Comprar» → ficha → añadir al carrito → carrito. Clics
   * reales: una capa invisible encima de cualquiera de ellos hace fallar.
   */
  async expectHostUsable() {
    const page = this.page;
    const count = page.getByTestId('cart-count');
    const before = Number(await count.textContent());
    await page.locator('.site-header .logo').click();
    await expect(page).toHaveURL(/localhost:\d+\/(\?|$)/);
    await page.getByTestId('shop-now').click();
    await page.getByTestId('newsletter-close').click();
    await page.getByTestId('product-44').click();
    await expect(page.getByTestId('product-title')).toBeVisible();
    await page.getByTestId('add-to-cart').click();
    await expect(count).toHaveText(String(before + 1));
    await page.getByTestId('nav-cart').click();
    await expect(page).toHaveURL(/\/cart/);
  }

  /** Los popups que este test espera ver, en orden. Se comprueba al terminar el test. */
  expectPopups(...ids: string[]) {
    this.expected = ids;
  }

  /** Espera a que el SDK tenga las definiciones y los triggers armados. */
  async popupsLoaded() {
    await this.page.waitForFunction(() => (window as any).__lab.sdk?.popupsLoaded !== false, null, { timeout: 15_000 });
  }

  /**
   * Marca el test como "fallo esperado" si la versión cargada tiene el bug. Hay que llamarlo
   * después de `open()` (con `latest` la versión exacta no se sabe hasta cargar el SDK).
   */
  async knownBug(bug: KnownBug) {
    const version = await this.sdkVersion();
    const applies = hasBug(bug, version);
    this.info.annotations.push({ type: 'known-bug', description: `${bug}: ${KNOWN_BUGS[bug].summary} (${applies ? 'present' : 'fixed'} in ${version})` });
    test.fail(applies, `known SDK bug ${bug}: ${KNOWN_BUGS[bug].summary}`);
  }

  /**
   * Puntos de la pantalla en los que un clic NO llegaría al host aunque se vea el host: los que
   * caen en el contenedor del SDK fuera de la tarjeta del popup (una capa invisible). Rejilla de
   * `cols × rows` sobre el viewport.
   */
  async interceptedPoints(cols = 8, rows = 6) {
    return this.page.evaluate(
      ({ cols, rows }) => {
        const out: string[] = [];
        const w = innerWidth;
        const h = innerHeight;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const x = Math.round(((i + 0.5) * w) / cols);
            const y = Math.round(((j + 0.5) * h) / rows);
            const el = document.elementFromPoint(x, y);
            if (!el) continue;
            const inContainer = el.closest('#deepdots-popup-container');
            const inCard = el.closest('.deepdots-popup');
            const container = document.getElementById('deepdots-popup-container');
            // Con velo (posición `center`) el fondo es visible y tapar el host es lo esperado.
            const veiled = container && getComputedStyle(container).backgroundColor !== 'rgba(0, 0, 0, 0)';
            if (inContainer && !inCard && !veiled) out.push(`${x},${y}`);
          }
        }
        return out;
      },
      { cols, rows },
    );
  }

  /** Bounding box de la tarjeta del popup. */
  async popupBox() {
    const box = await this.popup.boundingBox();
    expect(box, 'popup bounding box').not.toBeNull();
    return box!;
  }

  /**
   * Para el reloj falso en el instante actual de la página. A partir de aquí el tiempo solo
   * avanza con `advance()`: entre dos pasos del test no se cuela el tiempo real (con la CPU del
   * CI cargada eran cientos de ms). `resume()` antes de clics, que esperan a frames.
   */
  async freeze() {
    // `pauseAt` no admite el pasado y el reloj sigue corriendo mientras se le llama: se apunta
    // un poco por delante y, si aun así llega tarde, se reintenta.
    for (let attempt = 0; ; attempt++) {
      const now = await this.page.evaluate(() => Date.now());
      try {
        await this.page.clock.pauseAt(now + 100);
        return;
      } catch (error) {
        if (attempt >= 4 || !String(error).includes('to the past')) throw error;
      }
    }
  }

  async resume() {
    await this.page.clock.resume();
  }

  /** Avanza el reloj falso (requiere `page.clock.install()` antes de `open`). */
  async advance(ms: number) {
    // `fastForward` no acepta saltos por encima de 2^31 ms (~24,8 días): se trocea.
    const CHUNK = 20 * 24 * 60 * 60 * 1000;
    for (let left = ms; left > 0; left -= CHUNK) await this.page.clock.fastForward(Math.min(left, CHUNK));
  }
}

type Fixtures = { rlab: RegressionLab };

export const test = labTest.extend<Fixtures>({
  rlab: async ({ page, lab: _lab }, use, testInfo) => {
    testInfo.annotations.push({ type: 'platform', description: `web · ${testInfo.project.name}` });
    const rlab = new RegressionLab(page, testInfo);
    await use(rlab);

    expect(rlab.pageErrors, 'uncaught errors in the page').toEqual([]);
    if (rlab.expected) {
      const shown = await rlab.shownPopups().catch(() => [] as string[]);
      expect(shown, 'popups shown (unexpected, missing or duplicated)').toEqual(rlab.expected);
    }
  },
});

export { expect, SDK };

