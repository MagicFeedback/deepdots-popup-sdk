import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

/**
 * MOM_PROD, 25-oct-2026 (React Native, 1.11.0). Al pasar la app a background, el POST con el
 * cierre de la sesión llegaba a la API pero la app no recibía la respuesta (o moría antes de
 * enviarlo). El SDK lo daba por fallido y lo devolvía al buffer, donde salía con la sesión
 * SIGUIENTE y en su registro: `mini_service_exit` sin su enter (133 exits frente a 130
 * enters) y sesiones con solo `session_start` que la API cerraba por inactividad (104 de 810
 * con 0 s y sin páginas).
 */
type Body = {
  sessionId?: string;
  completed?: boolean;
  integration: string;
  feedback: { metadata: { key: string; value: string[] }[] };
};

const names = (b: Body) => b.feedback.metadata.filter((m) => m.value[0]?.startsWith('{')).map((m) => m.key);

describe('lotes cuya respuesta se pierde al pasar a background (RN)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  /** Lo que guardó la API: lotes por sessionId (sin sessionId, la API asigna uno). */
  let stored: Map<string, Body[]>;

  const store = (init: RequestInit): Body => {
    const body = JSON.parse(init.body as string) as Body;
    const id = body.sessionId ?? `server-${stored.size + 1}`;
    stored.set(id, [...(stored.get(id) ?? []), { ...body, sessionId: id }]);
    return { ...body, sessionId: id };
  };

  beforeEach(() => {
    stored = new Map();
    fetchSpy = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (!String(url).endsWith('/sdk/feedback')) return { ok: true, json: async () => [], text: async () => '' };
      const { sessionId } = store(init);
      return { ok: true, json: async () => ({ sessionId }) };
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  const start = (storage = new InMemoryStorage(), platform: 'android' | 'web' = 'android') => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      platform,
      storage,
      analytics: { publicKey: 'pub-a', integration: `int-lost-${platform}` },
    });
    return sdk;
  };

  /** Registros que recibió la API, en orden, con los nombres de sus eventos. */
  const records = () => [...stored.entries()].map(([id, bodies]) => ({ id, events: bodies.flatMap(names) }));

  it('el mini_service_exit de un cierre fallido no acaba en el registro de la sesión siguiente', async () => {
    const sdk = start();
    sdk.setScreen('/home');
    sdk.enterMiniService('events & activities', 'home');
    sdk.flushAnalytics();
    await settle();

    // 'background': el POST de cierre llega a la API, pero la app no ve la respuesta.
    fetchSpy.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      store(init);
      throw new TypeError('Network request failed');
    });
    sdk.onBackground();
    await settle();

    sdk.onForeground();
    sdk.setScreen('/home');
    sdk.onBackground();
    await settle();

    const [first, second] = records();
    expect(records()).toHaveLength(2);
    expect(first.events.filter((e) => e === 'deepdots_mini_service_enter')).toHaveLength(1);
    expect(first.events).toContain('deepdots_mini_service_exit');
    expect(second.events).not.toContain('deepdots_mini_service_exit');
    expect(second.events).not.toContain('deepdots_mini_service_enter');
    expect(second.events.filter((e) => e === 'deepdots_session_start')).toHaveLength(1);
    expect(second.events.filter((e) => e === 'deepdots_session_end')).toHaveLength(1);
  });

  it('si la app muere con el cierre sin entregar, el arranque siguiente lo manda a su registro', async () => {
    const storage = new InMemoryStorage();
    const sdk = start(storage);
    sdk.setScreen('/home');
    sdk.flushAnalytics(); // el session_start sale y abre el registro
    await settle();
    const [{ id: record }] = records();

    fetchSpy.mockImplementationOnce(() => new Promise(() => {})); // la app muere con el POST en vuelo
    sdk.setScreen('/inbox');
    sdk.onBackground();
    await settle();
    expect(records()[0].events).not.toContain('deepdots_session_end');

    start(storage); // arranque en frío: proceso nuevo, mismo storage (MMKV)
    await settle();

    const closings = stored.get(record)!.filter((b) => b.completed);
    expect(closings).toHaveLength(1);
    expect(names(closings[0])).toEqual(expect.arrayContaining(['deepdots_page_view', 'deepdots_session_end']));
  });

  it('en web no persiste los pendientes (el cierre sale con keepalive y las pestañas comparten storage)', async () => {
    const storage = new InMemoryStorage();
    const sdk = start(storage, 'web');
    sdk.flushAnalytics();
    await settle();
    fetchSpy.mockImplementationOnce(() => new Promise(() => {}));
    sdk.endSession();
    await settle();

    expect(storage.getItem('__deepdots_analytics_pending__:int-lost-web')).toBeNull();
  });
});
