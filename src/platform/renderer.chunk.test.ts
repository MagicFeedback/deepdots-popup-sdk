import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El chunk de `renderPopup` se carga perezosamente al abrir el primer popup. Si no llega (red
 * caída antes de la precarga, CDN que falla), el SDK no puede dejar un rechazo sin capturar en
 * la página del host ni quedarse creyendo que hay un popup abierto (MF-3245,
 * `chunk-load-failure`).
 */

vi.mock('../ui/renderPopup', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const { BrowserPopupRenderer } = await import('./renderer');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function show(renderer: InstanceType<typeof BrowserPopupRenderer>) {
  renderer.show('survey', 'product', undefined, () => {}, () => {});
}

describe('BrowserPopupRenderer · el chunk del popup no se descarga', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    document.body.innerHTML = '';
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('libera el renderer y avisa, sin rechazo sin capturar', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const renderer = new BrowserPopupRenderer();

    show(renderer);
    expect(renderer.isShowing()).toBe(true);
    await flush();

    expect(renderer.isShowing()).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('el siguiente popup lo vuelve a intentar', async () => {
    const renderer = new BrowserPopupRenderer();

    show(renderer);
    await flush();
    show(renderer);
    await flush();

    // Dos intentos de carga, dos avisos: el segundo no se quedó en el `if (this.visible) return`.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(renderer.isShowing()).toBe(false);
  });
});
