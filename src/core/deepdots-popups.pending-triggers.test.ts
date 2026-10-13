import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups, MAX_PENDING_TRIGGERS } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { mockPopupsApi, mockPopupsApiDeferred, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * Disparos recibidos antes de que lleguen las definiciones de popups.
 *
 * `init()` baja las definiciones con un GET asíncrono; un `triggerEvent('app_opened')` lanzado
 * justo después (lo normal al arrancar la app) se evaluaba contra una lista vacía y se perdía
 * con "No event popup definitions found". Mientras la carga está en vuelo, los disparos se
 * guardan y se reproducen en orden al cargar, por la evaluación normal. Espejo del
 * `PendingTriggersTest` del SDK nativo (KMP).
 */
function eventPopup(id: string, event: string, extra: Partial<PopupDefinition> = {}): PopupDefinition {
  return {
    id,
    title: id,
    message: '',
    triggers: [{ type: 'event', value: event }],
    surveyId: `survey-${id}`,
    productId: 'product-1',
    ...extra,
  };
}

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function logged(logger: ReturnType<typeof makeLogger>): string {
  return logger.log.mock.calls.flat().map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join('\n');
}

function shownPopupIds(listener: ReturnType<typeof vi.fn>): string[] {
  return listener.mock.calls.map(([e]) => (e as { data?: { popupId?: string } }).data?.popupId ?? '');
}

describe('DeepdotsPopups · disparos antes de cargar los popups', () => {
  let popups: DeepdotsPopups;
  let shown: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.location.hash = '#/home';
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    shown = vi.fn();
    popups.on('popup_shown', shown);
    logger = makeLogger();
  });
  afterEach(() => vi.unstubAllGlobals());

  function init(apiKey = 'k') {
    popups.init({ apiKey, debug: true, logger, storage: new InMemoryStorage() });
  }

  it('un evento disparado antes de que responda la API se muestra al llegar los popups', async () => {
    const api = mockPopupsApiDeferred([eventPopup('welcome', 'app_opened')]);
    init();

    popups.triggerEvent('app_opened');
    expect(shown).not.toHaveBeenCalled();
    expect(logged(logger)).not.toContain('No event popup definitions found');

    await api.release();
    expect(shownPopupIds(shown)).toEqual(['welcome']);
  });

  it('triggerSurvey antes de cargar también se reproduce', async () => {
    const api = mockPopupsApiDeferred([eventPopup('welcome', 'app_opened')]);
    init();

    popups.triggerSurvey('survey-welcome');
    await api.release();

    expect(shownPopupIds(shown)).toEqual(['welcome']);
  });

  it('los disparos guardados se reproducen en el orden en que llegaron', async () => {
    const api = mockPopupsApiDeferred([eventPopup('a', 'first'), eventPopup('b', 'second')]);
    init();

    popups.triggerEvent('second');
    popups.triggerEvent('first');
    await api.release();

    expect(shownPopupIds(shown)).toEqual(['b', 'a']);
  });

  it('el replay pasa por la evaluación normal: los segmentos se miran con el estado de AHORA', async () => {
    const api = mockPopupsApiDeferred([eventPopup('home-only', 'app_opened', { segments: { path: ['/#/home'] } })]);
    init();

    popups.triggerEvent('app_opened');
    // El usuario sale de /#/home antes de que lleguen los popups.
    window.location.hash = '#/game';
    await api.release();

    expect(shown).not.toHaveBeenCalled();
  });

  it('el replay respeta los cooldowns: el mismo evento dos veces enseña el popup una sola vez', async () => {
    const api = mockPopupsApiDeferred([
      eventPopup('once', 'app_opened', { cooldown: [{ answered: 'SHOWED', cooldownDays: 7 }] }),
    ]);
    init();

    popups.triggerEvent('app_opened');
    popups.triggerEvent('app_opened');
    await api.release();

    expect(shownPopupIds(shown)).toEqual(['once']);
  });

  it(`el buffer tiene techo (${MAX_PENDING_TRIGGERS}) y descarta los más antiguos`, async () => {
    const defs = Array.from({ length: MAX_PENDING_TRIGGERS + 1 }, (_, i) => eventPopup(`p${i}`, `e${i}`));
    const api = mockPopupsApiDeferred(defs);
    init();

    defs.forEach((_, i) => popups.triggerEvent(`e${i}`));
    expect(logged(logger)).toContain('Pending trigger buffer full; dropped oldest');
    await api.release();

    const ids = shownPopupIds(shown);
    expect(ids).toHaveLength(MAX_PENDING_TRIGGERS);
    expect(ids[0]).toBe('p1');
    expect(ids).not.toContain('p0');
  });

  it('si la carga falla se vacía el buffer y se deja de guardar', async () => {
    const api = mockPopupsApiDeferred([eventPopup('welcome', 'app_opened')]);
    init();

    popups.triggerEvent('app_opened');
    await api.fail();
    expect(shown).not.toHaveBeenCalled();
    expect(logged(logger)).toContain('Popups failed to load; dropped pending triggers');

    // Sin carga en vuelo, un disparo nuevo se evalúa ya (contra la lista vacía), no se guarda.
    logger.log.mockClear();
    popups.triggerEvent('app_opened');
    expect(logged(logger)).toContain('No event popup definitions found');
    expect(logged(logger)).not.toContain('trigger buffered');
  });

  it('si la API responde con error (no-2xx) tampoco se queda nada guardado', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'boom', text: async () => '' }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    init();

    popups.triggerEvent('app_opened');
    await flushPopupsLoad();

    expect(shown).not.toHaveBeenCalled();
    expect(logged(logger)).toContain('Popups failed to load; dropped pending triggers');
    logger.log.mockClear();
    popups.triggerEvent('app_opened');
    expect(logged(logger)).toContain('No event popup definitions found');
  });

  it('tras cargar, los eventos se evalúan al momento como siempre', async () => {
    mockPopupsApi([eventPopup('welcome', 'app_opened')]);
    init();
    await flushPopupsLoad();

    popups.triggerEvent('app_opened');
    expect(shownPopupIds(shown)).toEqual(['welcome']);
    expect(logged(logger)).not.toContain('trigger buffered');
  });

  it('sin apiKey no hay carga que esperar: no se guarda nada', () => {
    const fetchMock = mockPopupsApi([eventPopup('welcome', 'app_opened')]);
    init('');

    popups.triggerEvent('app_opened');

    expect(logged(logger)).toContain('No event popup definitions found');
    expect(logged(logger)).not.toContain('trigger buffered');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/popups'), undefined);
  });
});
