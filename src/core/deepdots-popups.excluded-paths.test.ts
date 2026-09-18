import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition, PopupSegments } from '../types';

/**
 * `segments.excludedPaths`: rutas donde el popup NO debe mostrarse.
 * Regla: gana sobre `segments.path`, y se aplica igual cuando no hay `path`.
 * Mismas formas de candidato que la lista de inclusión (absoluta / `/algo` / pathname).
 */

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function goTo(href: string): void {
  (window as unknown as { location: { href: string } }).location.href = href;
}

function defWithSegments(segments: PopupSegments, trigger: PopupDefinition['triggers'][number] = { type: 'event', value: 'ping' }): PopupDefinition[] {
  return [
    {
      id: 'popup-1',
      title: 'Popup',
      message: '',
      triggers: [trigger],
      surveyId: 'survey-1',
      productId: 'product-1',
      segments,
    },
  ];
}

async function startWith(defs: PopupDefinition[]): Promise<{ popups: DeepdotsPopups; shown: ReturnType<typeof vi.fn> }> {
  const popups = new DeepdotsPopups();
  popups.setRenderer(new NoopPopupRenderer());
  const shown = vi.fn();
  popups.on('popup_shown', shown);
  mockPopupsApi(defs);
  popups.init({ apiKey: 'k' });
  await flushPopupsLoad();
  popups.autoLaunch();
  return { popups, shown };
}

describe('segments.excludedPaths', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    goTo('http://localhost:3000/');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('no muestra el popup en una ruta excluida aunque `path` la incluya', async () => {
    // El caso del cliente: `path: ['/']` (= en todas) menos el carrito.
    const { popups, shown } = await startWith(defWithSegments({ lang: ['en'], path: ['/'], excludedPaths: ['/cart'] }));
    goTo('http://localhost:3000/cart');

    popups.triggerEvent('ping');

    expect(shown).not.toHaveBeenCalled();
  });

  it('sigue mostrándolo en el resto de rutas', async () => {
    const { popups, shown } = await startWith(defWithSegments({ lang: ['en'], path: ['/'], excludedPaths: ['/cart'] }));
    goTo('http://localhost:3000/products');

    popups.triggerEvent('ping');

    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ surveyId: 'survey-1' }));
  });

  it('excluye sin necesidad de `path`: sin lista de inclusión = en todas menos las excluidas', async () => {
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['/checkout'] }));

    goTo('http://localhost:3000/checkout');
    popups.triggerEvent('ping');
    expect(shown).not.toHaveBeenCalled();

    goTo('http://localhost:3000/home');
    popups.triggerEvent('ping');
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('la exclusión gana sobre una coincidencia exacta de `path`', async () => {
    const { popups, shown } = await startWith(defWithSegments({ path: ['/cart'], excludedPaths: ['/cart'] }));
    goTo('http://localhost:3000/cart');

    popups.triggerEvent('ping');

    expect(shown).not.toHaveBeenCalled();
  });

  it('acepta rutas con hash, igual que la lista de inclusión', async () => {
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['/#/cart'] }));

    goTo('http://localhost:3000/#/cart');
    popups.triggerEvent('ping');
    expect(shown).not.toHaveBeenCalled();

    goTo('http://localhost:3000/#/home');
    popups.triggerEvent('ping');
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('acepta una URL absoluta y entonces compara el href completo', async () => {
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['http://localhost:3000/cart'] }));

    goTo('http://localhost:3000/cart');
    popups.triggerEvent('ping');
    expect(shown).not.toHaveBeenCalled();

    // Mismo pathname en otro host: la URL absoluta no lo excluye.
    goTo('http://otro.local:3000/cart');
    popups.triggerEvent('ping');
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('una lista vacía no cambia nada', async () => {
    const { popups, shown } = await startWith(defWithSegments({ path: ['/'], excludedPaths: [] }));
    goTo('http://localhost:3000/cart');

    popups.triggerEvent('ping');

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('ignora entradas no-string sin tumbar la evaluación del evento', async () => {
    const excludedPaths = [null, 7, '/cart'] as unknown as string[];
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths }));

    goTo('http://localhost:3000/home');
    expect(() => popups.triggerEvent('ping')).not.toThrow();
    expect(shown).toHaveBeenCalledTimes(1);

    goTo('http://localhost:3000/cart');
    popups.triggerEvent('ping');
    expect(shown).toHaveBeenCalledTimes(1);
  });
});

describe('segments.excludedPaths · popups de exit diferidos', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    goTo('http://localhost:3000/');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('no encola el popup si la ruta de ORIGEN está excluida', async () => {
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['/cart'] }, { type: 'exit', value: 0 }));

    popups.queueExitPopup('survey-1', 0, 'http://localhost:3000/cart');
    goTo('http://localhost:3000/home');
    await wait(20);

    expect(shown).not.toHaveBeenCalled();
  });

  it('no lo pinta si la ruta de DESTINO está excluida, aunque ya estuviera encolado', async () => {
    // Al desencolar se levanta la comprobación de `path` (la ruta cambió a propósito),
    // pero "no mostrar en /cart" es una regla sobre la pantalla en la que se pinta.
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['/cart'] }, { type: 'exit', value: 0 }));

    popups.queueExitPopup('survey-1', 0, 'http://localhost:3000/home');
    goTo('http://localhost:3000/cart');
    await wait(20);

    expect(shown).not.toHaveBeenCalled();
  });

  it('sí lo pinta si la ruta de destino no está excluida', async () => {
    const { popups, shown } = await startWith(defWithSegments({ excludedPaths: ['/cart'] }, { type: 'exit', value: 0 }));

    popups.queueExitPopup('survey-1', 0, 'http://localhost:3000/home');
    goTo('http://localhost:3000/products');
    await wait(20);

    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ surveyId: 'survey-1' }));
  });
});
