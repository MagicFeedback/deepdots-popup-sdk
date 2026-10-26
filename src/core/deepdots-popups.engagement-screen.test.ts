import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';

/**
 * La pantalla en curso viaja en cada `deepdots_user_engagement` (`screen`, `path`,
 * `screen_seconds`).
 *
 * El `page_view` sale al SALIR de una pantalla o al cerrar la sesión. Si el cierre no llega
 * nunca (pestaña oculta 50 min o más que se descarta al volver, pestaña o app matada en
 * segundo plano), el backend cierra el registro con lo que tenga: una visita de una sola
 * pantalla se quedaba sin ningún page_view y una de varias perdía la última. Medido en la
 * analítica de la propia plataforma: ~24 % de sesiones sin page_view.
 */

const MIN = 60_000;

type Body = {
  sessionId?: string;
  completed: boolean;
  integration: string;
  feedback: { metadata: Array<{ key: string; value: string[] }> };
};

type Event = { name: string; timestamp: number; [k: string]: unknown };

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function eventsOf(body: Body): Event[] {
  return body.feedback.metadata
    .filter((e) => e.key.startsWith('deepdots_') && e.value?.[0]?.startsWith('{'))
    .map((e) => ({ name: e.key, ...JSON.parse(e.value[0]) }));
}

describe('the current screen in deepdots_user_engagement', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let bodies: (integration: string) => Body[];
  const events = (integration: string, name?: string) =>
    bodies(integration)
      .flatMap(eventsOf)
      .filter((e) => !name || e.name === name);

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    const opened = new Map<string, number>();
    fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      if (!body.sessionId) opened.set(body.integration, (opened.get(body.integration) ?? 0) + 1);
      const id = body.sessionId ?? `${body.integration}:${opened.get(body.integration)}`;
      return { ok: true, json: async () => ({ sessionId: id }) };
    });
    vi.stubGlobal('fetch', fetchSpy);
    bodies = (integration) =>
      fetchSpy.mock.calls
        .filter(([u]) => typeof u === 'string' && (u as string).endsWith('/sdk/feedback'))
        .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body)
        .filter((b) => b.integration === integration);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Las instancias de tests anteriores siguen escuchando en el mismo window: cada test usa su
  // propia integración para contar solo sus lotes.
  const start = (integration: string, path = '/orders/42') => {
    window.history.pushState({}, '', path);
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration },
    });
    return sdk;
  };

  it('the 5-minute heartbeat carries the screen, its real path and the seconds spent on it', async () => {
    const enteredAt = Date.now();
    start('int-scr-heartbeat');
    await vi.advanceTimersByTimeAsync(5.5 * MIN);

    const [heartbeat] = events('int-scr-heartbeat', 'deepdots_user_engagement');
    expect(heartbeat).toMatchObject({ screen: '/orders/:id', path: '/orders/42' });
    expect(typeof heartbeat.engagement_time_msec).toBe('number');
    // Mismo reloj que el duration_seconds del page_view: desde que se entró en la pantalla.
    expect(heartbeat.screen_seconds).toBe(Math.round((heartbeat.timestamp - enteredAt) / 1000));
    expect(heartbeat.screen_seconds).toBeGreaterThanOrEqual(5 * 60);
    // Sin page_view de más: la pantalla sigue abierta.
    expect(events('int-scr-heartbeat', 'deepdots_page_view')).toHaveLength(0);
  });

  it('after navigating, the engagement reports the new screen counted from its entry', async () => {
    start('int-scr-nav', '/home');
    await vi.advanceTimersByTimeAsync(2 * MIN);
    window.history.pushState({}, '', '/cart');
    await vi.advanceTimersByTimeAsync(3.5 * MIN);

    const [heartbeat] = events('int-scr-nav', 'deepdots_user_engagement');
    expect(heartbeat).toMatchObject({ screen: '/cart', path: '/cart' });
    expect(heartbeat.screen_seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(heartbeat.screen_seconds).toBeLessThan(4 * 60);
    const pages = events('int-scr-nav', 'deepdots_page_view');
    expect(pages.map((p) => p.screen)).toEqual(['/home']); // solo la que se abandonó
  });

  it('hiding the tab flushes an engagement with the screen, and no page_view', async () => {
    start('int-scr-hidden');
    await vi.advanceTimersByTimeAsync(40_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);

    const engagement = events('int-scr-hidden', 'deepdots_user_engagement');
    expect(engagement).toHaveLength(1);
    expect(engagement[0]).toMatchObject({ screen: '/orders/:id', path: '/orders/42', screen_seconds: 40 });
    expect(events('int-scr-hidden', 'deepdots_page_view')).toHaveLength(0);
  });

  it('a tab hidden 50+ minutes is discarded on return, but the screen already went out', async () => {
    start('int-scr-discard');
    await vi.advanceTimersByTimeAsync(40_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(55 * MIN);
    const oldRecord = bodies('int-scr-discard')[0].sessionId;
    const firstRecord = (b: Body) => b.sessionId === oldRecord;
    const before = bodies('int-scr-discard').filter(firstRecord).length;
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);

    const record = bodies('int-scr-discard').filter(firstRecord);
    expect(record).toHaveLength(before); // el descarte no manda nada al registro viejo
    const recordEvents = record.flatMap(eventsOf);
    expect(recordEvents.some((e) => e.name === 'deepdots_page_view')).toBe(false);
    // Lo único que el backend sabe de la pantalla: el engagement de ocultar la pestaña.
    expect(recordEvents.find((e) => e.name === 'deepdots_user_engagement')).toMatchObject({
      screen: '/orders/:id',
      screen_seconds: 40,
    });
  });

  it('closing the page emits the page_view once and a closing engagement without screen', async () => {
    start('int-scr-close');
    await vi.advanceTimersByTimeAsync(40_000);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    const pages = events('int-scr-close', 'deepdots_page_view');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ screen: '/orders/:id', duration_seconds: 40 });
    const engagement = events('int-scr-close', 'deepdots_user_engagement');
    expect(engagement).toHaveLength(1);
    // La pantalla ya tiene su page_view: el engagement del cierre no la repite.
    expect(engagement[0]).not.toHaveProperty('screen');
    expect(engagement[0]).not.toHaveProperty('screen_seconds');
  });

  it('manual navigation (setScreen, React Native) is reported the same way', async () => {
    window.history.pushState({}, '', '/');
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      platform: 'ios',
      analytics: { publicKey: 'pub-a', integration: 'int-scr-rn' },
    });
    sdk.setScreen('Checkout');
    await vi.advanceTimersByTimeAsync(5.5 * MIN);

    // Mismo nombre normalizado que llevaría su page_view.
    const [heartbeat] = events('int-scr-rn', 'deepdots_user_engagement');
    expect(heartbeat).toMatchObject({ screen: '/Checkout', path: '/Checkout' });
    expect(heartbeat.screen_seconds).toBeGreaterThanOrEqual(5 * 60);
  });
});
