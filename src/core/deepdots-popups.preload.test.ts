import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import type { PopupRenderer } from '../platform/renderer';
import type { PopupDefinition } from '../types';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';

/**
 * El chunk de `renderPopup` (DOM + @magicfeedback/native + CSS, ~238 KB sin comprimir) se
 * descarga hoy cuando el trigger ya disparó, así que su latencia la paga el usuario delante del
 * popup. Se precalienta en idle, pero solo cuando hay algún popup que pueda llegar a abrirse:
 * un host sin popups configurados no debe bajar nada.
 */
function makeRenderer(): PopupRenderer & { preload: () => void } {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    preload: vi.fn(),
  };
}

const def: PopupDefinition = {
  id: 'popup-1',
  title: 'Test',
  message: '',
  surveyId: 'survey-1',
  productId: 'product-1',
  triggers: [{ type: 'event', value: 'algo' }],
};

describe('precalentado del chunk del popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('precalienta cuando la API devuelve popups', async () => {
    mockPopupsApi([def]);
    const renderer = makeRenderer();
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(renderer);

    sdk.init({ apiKey: 'k' });
    await flushPopupsLoad();

    expect(renderer.preload).toHaveBeenCalledTimes(1);
  });

  it('no precalienta si el host no tiene popups configurados', async () => {
    mockPopupsApi([]);
    const renderer = makeRenderer();
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(renderer);

    sdk.init({ apiKey: 'k' });
    await flushPopupsLoad();

    expect(renderer.preload).not.toHaveBeenCalled();
  });

  it('no se cae con un renderer que no sepa precalentar (React Native, SSR)', async () => {
    mockPopupsApi([def]);
    const renderer: PopupRenderer = { show: vi.fn(), hide: vi.fn() };
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(renderer);

    sdk.init({ apiKey: 'k' });
    await expect(flushPopupsLoad()).resolves.toBeUndefined();
  });
});
