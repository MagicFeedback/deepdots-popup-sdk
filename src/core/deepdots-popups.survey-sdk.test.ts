import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import type { PopupRenderer, PopupRenderOptions } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * DD-70: `surveyFrontend.sdkVersion` de la API (versión de survey SDK asignada al survey en el
 * Admin) llega al renderer, que decide si la usa. Sin el campo (API anterior) llega undefined.
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

const def = (extra: Partial<PopupDefinition>): PopupDefinition[] => [
  {
    id: 'popup-1',
    title: 'Hej',
    message: '',
    triggers: [{ type: 'event', value: 'RATING' }],
    surveyId: 'survey-1',
    productId: 'product-1',
    ...extra,
  },
];

async function boot(renderer: PopupRenderer, defs: PopupDefinition[], debug = false) {
  const popups = new DeepdotsPopups();
  popups.setRenderer(renderer);
  mockPopupsApi(defs);
  popups.init({ apiKey: 'k', debug });
  await flushPopupsLoad();
  popups.autoLaunch();
  popups.triggerEvent('RATING');
  await flushPopupsLoad();
  return popups;
}

describe('DeepdotsPopups — survey SDK asignado (DD-70)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pasa surveyFrontend.sdkVersion y debug al renderer', async () => {
    const renderer = new CapturingRenderer();
    await boot(renderer, def({ surveyFrontend: { version: '3.3.0', preference: '3.3.0', status: 'stable', sdkVersion: '2.2.38' } }), true);
    expect(renderer.shown).toBe(1);
    expect(renderer.options?.surveySdkVersion).toBe('2.2.38');
    expect(renderer.options?.debug).toBe(true);
  });

  it('API sin el campo: undefined (el renderer usa la empaquetada)', async () => {
    const renderer = new CapturingRenderer();
    await boot(renderer, def({}));
    expect(renderer.shown).toBe(1);
    expect(renderer.options?.surveySdkVersion).toBeUndefined();
  });

  it('surveyFrontend null o sin sdkVersion: no rompe el popup', async () => {
    const renderer = new CapturingRenderer();
    await boot(renderer, def({ surveyFrontend: null }));
    expect(renderer.shown).toBe(1);
    expect(renderer.options?.surveySdkVersion).toBeUndefined();

    const renderer2 = new CapturingRenderer();
    await boot(renderer2, def({ surveyFrontend: { version: '3.0.0', sdkVersion: null } }));
    expect(renderer2.options?.surveySdkVersion).toBeNull();
  });
});
