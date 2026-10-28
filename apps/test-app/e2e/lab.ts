import { test as base, expect, type Page } from '@playwright/test';

/**
 * Helpers de la test app. Base para MF-3245 (regresión funcional) y MF-3247 (visual).
 *
 * Todo pasa por la UI real y por `window.__lab` (ver app/lab.js): eventos del SDK, rutas,
 * red vista por el service worker. Ningún test toca el SDK por dentro.
 */

export const SDK = process.env.SDK_VERSION ?? 'latest';
const IS_EXACT = /^\d+\.\d+\.\d+/.test(SDK);

type LabEvent = { kind: string; name: string; data?: unknown };
type LabNet = { method: string; url: string; host: string; path: string; status: number; note?: string; blocked?: boolean };

export type LabParams = Partial<Record<'scenario' | 'fault' | 'nav' | 'load' | 'lang' | 'popups' | 'css' | 'user', string>>;

export class Lab {
  constructor(readonly page: Page) {}

  /** Abre la tienda en `path` con el SDK de esta ejecución y espera a que el SDK haya hecho init. */
  async open(path: string, params: LabParams = {}) {
    const q = new URLSearchParams({ sdk: SDK, ...params });
    await this.page.goto(`${path}?${q}`);
    await this.page.waitForFunction(() => (window as any).__lab?.ready === true, null, { timeout: 30_000 });
    return this;
  }

  events(): Promise<LabEvent[]> {
    return this.page.evaluate(() => (window as any).__lab.events.map(({ kind, name, data }: any) => ({ kind, name, data })));
  }

  network(): Promise<LabNet[]> {
    return this.page.evaluate(() => (window as any).__lab.network);
  }

  sdkVersion(): Promise<string | null> {
    return this.page.evaluate(() => (window as any).__lab.sdkVersion);
  }

  /** Espera a que el SDK emita `popup_shown` de ese popup (por id de fixture). */
  async expectPopupShown(popupId: string, timeout = 10_000) {
    await expect
      .poll(async () => (await this.shownPopups()).includes(popupId), { timeout, message: `popup_shown ${popupId}` })
      .toBe(true);
    await expect(this.popup).toBeVisible();
  }

  /** Comprueba que durante `ms` NO aparece ningún popup. */
  async expectNoPopupFor(ms: number) {
    await this.page.waitForTimeout(ms);
    expect(await this.shownPopups(), 'no popup_shown expected').toEqual([]);
    await expect(this.popup).toBeHidden();
  }

  async shownPopups(): Promise<string[]> {
    return (await this.events())
      .filter((e) => e.kind === 'event' && e.name === 'popup_shown')
      .map((e) => (e.data as any)?.popup ?? (e.data as any)?.survey);
  }

  get popup() {
    return this.page.locator('#deepdots-popup-container .deepdots-popup');
  }

  async closePopup() {
    const close = this.page.locator('#deepdots-popup-container #dd-close, #deepdots-popup-container button[aria-label]').first();
    await close.click();
    await expect(this.popup).toBeHidden();
  }

  /** Navegación de la tienda por enlaces (lo que haría un usuario). */
  async clickNav(testId: string) {
    await this.page.getByTestId(testId).click();
  }

  /**
   * El host sigue usable: navega a una ficha, añade al carrito (el contador sube) y vuelve al
   * carrito. Son clics reales de Playwright, así que un overlay invisible que se coma los
   * clics (p. ej. un contenedor del popup a pantalla completa que no se retiró) hace fallar.
   */
  async expectHostUsable() {
    const count = this.page.getByTestId('cart-count');
    const before = Number(await count.textContent());
    await this.clickNav('nav-products');
    await this.page.getByTestId('newsletter-close').click();
    await this.page.getByTestId('product-44').click();
    await expect(this.page.getByTestId('product-title')).toBeVisible();
    await this.page.getByTestId('add-to-cart').click();
    await expect(count).toHaveText(String(before + 1));
    await this.clickNav('nav-cart');
    await expect(this.page).toHaveURL(/\/cart/);
  }
}

type Fixtures = { lab: Lab };

export const test = base.extend<Fixtures>({
  lab: async ({ page }, use, testInfo) => {
    const prodRequests: string[] = [];
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (host === 'api.deepdots.com') prodRequests.push(req.url());
    });
    page.on('console', (msg) => {
      if (msg.text().startsWith('[lab]')) process.stdout.write(`    ${msg.text()}\n`);
    });

    const lab = new Lab(page);
    await use(lab);

    // Cada run dice qué versión probó (va al reporte y al log del CI).
    const version = await page.evaluate(() => (window as any).__lab?.sdkVersion).catch(() => null);
    testInfo.annotations.push({ type: 'sdk', description: `${version ?? 'not loaded'} (${SDK}) · DEV` });
    if (IS_EXACT && version) expect(version, 'loaded SDK version').toBe(SDK);

    // Aislamiento: nada de esta suite toca producción.
    const blocked = await page
      .evaluate(() => (window as any).__lab?.network.filter((n: any) => n.blocked).map((n: any) => n.url) ?? [])
      .catch(() => []);
    expect([...prodRequests, ...blocked], 'requests to production').toEqual([]);
  },
});

export { expect };
