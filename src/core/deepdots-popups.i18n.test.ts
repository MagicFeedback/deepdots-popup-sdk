import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import type { PopupRenderer, PopupRenderOptions } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * El idioma resuelto en `init()` (host > navigator > Intl) llega al renderer para que el
 * chrome del popup (botones, progreso, aria-labels) arranque traducido. Es el mismo idioma
 * que ya se reporta al canal de analytics y con el que se segmenta por `segments.lang`:
 * una única fuente de verdad, no un tercer camino.
 */
class CapturingRenderer implements PopupRenderer {
  public options: PopupRenderOptions | undefined;
  public shown = 0;
  show(
    _surveyId: string,
    _productId: string,
    _actions: unknown,
    _emit: unknown,
    _onClose: unknown,
    _env?: string,
    _userId?: string,
    _style?: unknown,
    _sessionId?: string,
    _miniService?: string,
    _analyticsFeedbackSessionId?: string,
    _renderChrome?: boolean,
    options?: PopupRenderOptions,
  ): void {
    this.shown++;
    this.options = options;
  }
  hide(): void { /* no-op */ }
}

const defs: PopupDefinition[] = [
  {
    id: 'popup-1',
    title: 'Hej',
    message: '',
    triggers: [{ type: 'event', value: 'RATING' }],
    surveyId: 'survey-1',
    productId: 'product-1',
  },
];

async function boot(renderer: PopupRenderer, init: Parameters<DeepdotsPopups['init']>[0]) {
  const popups = new DeepdotsPopups();
  popups.setRenderer(renderer);
  mockPopupsApi(defs);
  popups.init(init);
  await flushPopupsLoad();
  popups.autoLaunch();
  popups.triggerEvent('RATING');
  await flushPopupsLoad();
  return popups;
}

describe('DeepdotsPopups — idioma del chrome del popup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pasa al renderer el idioma explícito del init', async () => {
    const renderer = new CapturingRenderer();
    await boot(renderer, { apiKey: 'k', language: 'da-DK' });

    expect(renderer.shown).toBe(1);
    expect(renderer.options?.language).toBe('da-DK');
  });

  it('sin idioma explícito pasa el que resuelve el SDK (navigator/Intl)', async () => {
    vi.stubGlobal('navigator', { language: 'sv-SE' });
    const renderer = new CapturingRenderer();
    await boot(renderer, { apiKey: 'k' });

    expect(renderer.options?.language).toBe('sv-SE');
  });
});
