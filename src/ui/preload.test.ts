import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Precalentado del chunk de `renderPopup`.
 *
 * El chunk lleva el DOM del popup + `@magicfeedback/native` + el CSS vendorizado (~238 KB sin
 * comprimir) y hoy se descarga cuando el trigger ya ha disparado, así que su latencia se paga
 * delante del usuario. Traerlo en idle lo saca del camino crítico.
 *
 * Cada test reimporta el módulo con `resetModules` porque la memoización es estado del módulo.
 */
async function freshModule() {
  vi.resetModules();
  return import('./preload');
}

describe('preloadRenderPopup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carga el chunk una sola vez aunque se pida varias veces', async () => {
    const { preloadRenderPopup } = await freshModule();
    const loader = vi.fn(async () => ({ renderPopup: () => {} }));

    await preloadRenderPopup(loader);
    await preloadRenderPopup(loader);
    await preloadRenderPopup(loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('no propaga el fallo de red y deja reintentar', async () => {
    const { preloadRenderPopup } = await freshModule();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ renderPopup: () => {} });

    // Un precalentado es oportunista: si falla, el import de `show()` lo volverá a intentar.
    await expect(preloadRenderPopup(loader)).resolves.toBeUndefined();
    await preloadRenderPopup(loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('lo agenda en requestIdleCallback cuando el navegador lo soporta', async () => {
    const { schedulePreloadRenderPopup } = await freshModule();
    const loader = vi.fn(async () => ({}));
    const ric = vi.fn((cb: () => void) => { cb(); return 1; });
    vi.stubGlobal('requestIdleCallback', ric);

    schedulePreloadRenderPopup(loader);

    expect(ric).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cae a setTimeout en navegadores sin requestIdleCallback (Safari)', async () => {
    const { schedulePreloadRenderPopup } = await freshModule();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({}));

    schedulePreloadRenderPopup(loader);
    expect(loader).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(loader).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('preload en el renderer de navegador', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('BrowserPopupRenderer expone preload()', async () => {
    const { BrowserPopupRenderer } = await import('../platform/renderer');
    const renderer = new BrowserPopupRenderer();
    expect(typeof renderer.preload).toBe('function');
  });

  it('NoopPopupRenderer no precalienta nada', async () => {
    const { NoopPopupRenderer } = await import('../platform/renderer');
    const renderer = new NoopPopupRenderer();
    expect(renderer.preload).toBeUndefined();
  });
});
