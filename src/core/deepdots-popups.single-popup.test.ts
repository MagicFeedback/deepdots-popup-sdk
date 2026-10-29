import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer, type PopupRenderer } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * Un popup abierto cada vez, y lo que no se pinta no cuenta como mostrado (MF-3245).
 *
 * El renderer del navegador nunca apila popups: con uno abierto ignora el siguiente. El core,
 * en cambio, lo daba por mostrado igual (popup_shown, POST SHOWED y cooldown gastado), así que
 * un trigger repetido inflaba SHOWED y un segundo popup perdía su cooldown sin haberse visto.
 */

/** Renderer como el del navegador: uno a la vez, y sabe si hay uno abierto. */
class SingleRenderer implements PopupRenderer {
  shown: string[] = [];
  private open = false;
  private onClose: (() => void) | null = null;
  show(surveyId: string, _productId: string, _actions: unknown, _emit: unknown, onClose: () => void): void {
    if (this.open) return;
    this.open = true;
    this.onClose = onClose;
    this.shown.push(surveyId);
  }
  hide(): void {
    this.open = false;
  }
  isShowing(): boolean {
    return this.open;
  }
  /** El usuario cierra con la X. */
  close() {
    this.onClose?.();
  }
}

const eventPopup = (id: string, surveyId: string, cooldown?: PopupDefinition['cooldown']): PopupDefinition => ({
  id,
  title: id,
  message: '',
  triggers: [{ type: 'event', value: id }],
  surveyId,
  productId: 'product-1',
  cooldown,
});

const showedPosts = (fetchMock: ReturnType<typeof mockPopupsApi>) =>
  fetchMock.mock.calls.filter(([url, opts]) => String(url).endsWith('/sdk/popups') && (opts as { method?: string })?.method === 'POST');

async function setup(defs: PopupDefinition[], renderer: PopupRenderer) {
  const popups = new DeepdotsPopups();
  popups.setRenderer(renderer);
  const shown = vi.fn();
  popups.on('popup_shown', shown);
  const fetchMock = mockPopupsApi(defs);
  popups.init({ apiKey: 'k' });
  await flushPopupsLoad();
  popups.autoLaunch();
  return { popups, shown, fetchMock };
}

describe('DeepdotsPopups · un popup a la vez', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('el mismo evento repetido con el popup abierto: un popup_shown y un SHOWED', async () => {
    const renderer = new SingleRenderer();
    const { popups, shown, fetchMock } = await setup([eventPopup('rate', 'survey-rate')], renderer);

    for (let i = 0; i < 5; i++) popups.triggerEvent('rate');
    await Promise.resolve();

    expect(renderer.shown).toEqual(['survey-rate']);
    expect(shown).toHaveBeenCalledTimes(1);
    expect(showedPosts(fetchMock)).toHaveLength(1);
  });

  it('otro popup con uno abierto: no se emite ni gasta su cooldown, y sale cuando toca después', async () => {
    const renderer = new SingleRenderer();
    const { popups, shown } = await setup(
      [eventPopup('help', 'survey-help'), eventPopup('account', 'survey-account', [{ answered: 'SHOWED', cooldownDays: 1 }])],
      renderer,
    );

    popups.triggerEvent('help');
    popups.triggerEvent('account');

    expect(shown.mock.calls.map(([e]) => e.data.popupId)).toEqual(['help']);
    const state = JSON.parse(localStorage.getItem('deepdots.popups.state') ?? '{}');
    expect(Object.keys(state.lastShown ?? {})).toEqual(['help']);

    // El usuario cierra el primero: el segundo, sin cooldown gastado, ya puede salir.
    renderer.close();
    popups.triggerEvent('account');
    expect(shown.mock.calls.map(([e]) => e.data.popupId)).toEqual(['help', 'account']);
  });

  it('tras cerrar, el mismo popup sin cooldown puede volver a salir', async () => {
    const renderer = new SingleRenderer();
    const { popups, shown } = await setup([eventPopup('rate', 'survey-rate')], renderer);

    popups.triggerEvent('rate');
    renderer.close();
    popups.triggerEvent('rate');

    expect(shown).toHaveBeenCalledTimes(2);
    expect(renderer.shown).toEqual(['survey-rate', 'survey-rate']);
  });

  it('un renderer sin isShowing (host, RN) se comporta como siempre', async () => {
    const { popups, shown } = await setup([eventPopup('rate', 'survey-rate')], new NoopPopupRenderer());

    popups.triggerEvent('rate');
    popups.triggerEvent('rate');

    expect(shown).toHaveBeenCalledTimes(2);
  });
});
