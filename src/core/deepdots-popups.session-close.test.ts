import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { setupReactNative } from '../react-native/setup';

/**
 * DD-55: cierre de sesión sin pérdidas, un test por cada forma de cerrar.
 *
 * Producción con React Native (popup-sdk 1.17, nov 2026): en iOS el 20 % de las sesiones se
 * cerraban tarde (el lote de cierre llegaba al volver a abrir la app, mediana 49 min) y el 12 %
 * no se cerraban nunca; en Android, ~2 %. El `session_end` lleva la hora del `background`: el
 * SDK procesa el evento a tiempo, pero iOS suspende la app con el POST en vuelo.
 */

const MIN = 60_000;

type Body = {
  sessionId?: string;
  completed?: boolean;
  integration: string;
  feedback: { metadata: { key: string; value: string[] }[] };
};

const eventsOf = (b: Body) =>
  b.feedback.metadata
    .filter((m) => m.value[0]?.startsWith('{'))
    .map((m) => ({ name: m.key, ...(JSON.parse(m.value[0]) as Record<string, unknown>) }));

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('cierre de sesión (DD-55)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  const okFetch = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Body;
    return { ok: true, json: async () => ({ sessionId: body.sessionId }), text: async () => '' };
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchSpy = vi.fn().mockImplementation(okFetch);
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const bodies = (integration: string): Body[] =>
    fetchSpy.mock.calls
      .filter(([u]) => String(u).endsWith('/sdk/feedback'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body)
      .filter((b) => b.integration === integration);

  const startRn = (integration: string, extra: Partial<Parameters<DeepdotsPopups['init']>[0]> = {}, storage = new InMemoryStorage()) => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      platform: 'ios',
      storage,
      analytics: { publicKey: 'pub-a', integration },
      ...extra,
    });
    return sdk;
  };

  it('background: el lote de cierre sale dentro de una background task, que se cierra al responder', async () => {
    let respond!: () => void;
    const order: string[] = [];
    const end = vi.fn(() => order.push('end'));
    const begin = vi.fn(() => {
      order.push('begin');
      return end;
    });
    const sdk = startRn('int-close-bg', { backgroundTask: begin });
    sdk.setScreen('/home');
    sdk.flushAnalytics();
    await settle();
    begin.mockClear();
    end.mockClear();
    order.length = 0;

    // La API tarda: la tarea tiene que seguir abierta mientras el POST esté en vuelo.
    fetchSpy.mockImplementationOnce((url: string, init: RequestInit) => {
      order.push('post');
      return new Promise((resolve) => {
        respond = () => resolve(okFetch(url, init));
      });
    });
    sdk.onBackground();
    await settle();

    const closing = bodies('int-close-bg').at(-1)!;
    expect(closing.completed).toBe(true);
    expect(eventsOf(closing).map((e) => e.name)).toContain('deepdots_session_end');
    expect(order).toEqual(['begin', 'post']); // la tarea se abre ANTES del POST
    expect(end).not.toHaveBeenCalled();

    respond();
    await settle();
    await settle();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('background: sin background task el cierre sale igual (comportamiento de 1.17)', async () => {
    const sdk = startRn('int-close-bg-none');
    sdk.setScreen('/home');
    sdk.onBackground();
    await settle();
    expect(bodies('int-close-bg-none').at(-1)).toMatchObject({ completed: true });
  });

  it('inactive (iOS): envía engagement con la pantalla en curso y NO cierra la sesión', async () => {
    const handlers: ((s: string) => void)[] = [];
    const sdk = new DeepdotsPopups();
    setupReactNative(
      sdk,
      { apiKey: 'pk-1', nodeEnv: 'development', analytics: { publicKey: 'pub-a', integration: 'int-close-inactive' } },
      {
        platform: 'ios',
        renderer: new NoopPopupRenderer(),
        appState: { addEventListener: (_t, l) => void handlers.push(l) },
      },
    );
    sdk.setScreen('/wallet');
    await new Promise((r) => setTimeout(r, 1100)); // al menos 1 s de engagement
    handlers[0]('inactive');
    await settle();

    const afterInactive = bodies('int-close-inactive');
    const sent = afterInactive.flatMap(eventsOf);
    const engagement = sent.find((e) => e.name === 'deepdots_user_engagement');
    expect(engagement).toMatchObject({ screen: '/wallet' });
    expect(Number((engagement as Record<string, unknown>).engagement_time_msec)).toBeGreaterThan(0);
    expect(sent.some((e) => e.name === 'deepdots_session_end')).toBe(false);
    expect(afterInactive.every((b) => !b.completed)).toBe(true);

    // ...y el `background` siguiente cierra ESA sesión, no otra.
    handlers[0]('background');
    await settle();
    const all = bodies('int-close-inactive');
    const closing = all.at(-1)!;
    expect(closing.completed).toBe(true);
    expect(closing.sessionId).toBe(afterInactive[0].sessionId);
  }, 5000);

  it('app matada: el cierre que no llegó a salir se reenvía en el arranque siguiente', async () => {
    const storage = new InMemoryStorage();
    const before = startRn('int-close-killed', {}, storage);
    before.setScreen('/home');
    before.flushAnalytics();
    await settle();
    const sessionId = bodies('int-close-killed')[0].sessionId;

    // iOS suspende/mata la app con el POST de cierre en vuelo: no responde nunca.
    fetchSpy.mockImplementationOnce(() => new Promise(() => {}));
    before.onBackground();
    await settle();
    const sentBeforeRelaunch = bodies('int-close-killed').length;

    // Arranque siguiente, mismo storage (MMKV).
    startRn('int-close-killed', {}, storage);
    await settle();
    await settle();

    const resent = bodies('int-close-killed').slice(sentBeforeRelaunch);
    const resentClose = resent.find((b) => b.completed && b.sessionId === sessionId);
    expect(resentClose).toBeDefined();
    expect(eventsOf(resentClose!).map((e) => e.name)).toContain('deepdots_session_end');
  });

  it('inactividad (web): tras más de 30 min oculta, la sesión se cierra con idle_timeout dentro de la background task', async () => {
    vi.useFakeTimers();
    const end = vi.fn();
    const begin = vi.fn(() => end);
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration: 'int-close-idle' },
      backgroundTask: begin,
    });
    sdk.flushAnalytics();
    await vi.advanceTimersByTimeAsync(0);
    const first = bodies('int-close-idle')[0].sessionId;

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(31 * MIN);
    begin.mockClear();
    end.mockClear();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    const closing = bodies('int-close-idle').find((b) => b.completed);
    expect(closing?.sessionId).toBe(first);
    expect(eventsOf(closing!).find((e) => e.name === 'deepdots_session_end')).toMatchObject({ reason: 'idle_timeout' });
    expect(begin).toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(begin.mock.calls.length);
  });
});
