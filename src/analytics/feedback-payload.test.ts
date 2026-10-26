import { describe, expect, it, vi } from 'vitest';
import { buildAnalyticsFeedbackBody, createFeedbackSink } from './feedback-payload';
import type { AnalyticsEnvelope } from './analytics-manager';
import { InMemoryStorage } from '../tracking/tracking-manager';

const KEYS = { publicKey: 'pub-k', integration: 'int-1' };

function envelope(overrides: Partial<AnalyticsEnvelope> = {}): AnalyticsEnvelope {
  return {
    publicKey: 'pub-k',
    userId: 'u-1',
    sessionId: 'srv-9',
    context: {
      platform: 'web',
      language: 'es-ES',
      device: { device_type: 'mobile', user_agent: 'UA/1', app_version: '1.2.3' },
      attributes: { pass_type: 'premium' },
    },
    events: [
      { name: 'deepdots_page_view', timestamp: 1000, params: { screen: '/home', duration_seconds: 5 } },
      { name: 'deepdots_user_engagement', timestamp: 2000, params: { engagement_time_msec: 4200 } },
    ],
    ...overrides,
  };
}

/** Convierte metadata a mapa key→value[0] para assertions de campos de sistema. */
function mdMap(body: ReturnType<typeof buildAnalyticsFeedbackBody>) {
  return Object.fromEntries(body.feedback.metadata.map((m) => [m.key, m.value[0]]));
}

describe('buildAnalyticsFeedbackBody', () => {
  it('pone cada evento en metadata con {key: nombre, value: [JSON(timestamp+params)]}; answers vacío', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    const md = mdMap(body);
    expect(md.deepdots_page_view).toBe(JSON.stringify({ timestamp: 1000, screen: '/home', duration_seconds: 5 }));
    expect(md.deepdots_user_engagement).toBe(JSON.stringify({ timestamp: 2000, engagement_time_msec: 4200 }));
    // formato correcto: value es array
    const evEntry = body.feedback.metadata.find((m) => m.key === 'deepdots_page_view')!;
    expect(evEntry.value).toBeInstanceOf(Array);
    expect(evEntry.value).toHaveLength(1);
    expect(body.feedback.answers).toEqual([]);
  });

  it('vuelca context.metrics en feedback.metrics con {key, value:[String]} sin prefijo', () => {
    const body = buildAnalyticsFeedbackBody(
      envelope({ context: { platform: 'web', attributes: {}, metrics: { cart_value: '49.99', items: '3' } } }),
      KEYS,
    );
    expect(body.feedback.metrics).toEqual([
      { key: 'cart_value', value: ['49.99'] },
      { key: 'items', value: ['3'] },
    ]);
  });

  it('feedback.metrics es [] cuando no hay métricas', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.feedback.metrics).toEqual([]);
  });

  it('pone la identidad en profile (external-user-id) y deepdots_user_id/deepdots_session_id en metadata', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.feedback.profile).toEqual([{ key: 'external-user-id', value: ['u-1'] }]);
    const md = mdMap(body);
    expect(md.deepdots_user_id).toBe('u-1');
    expect(md.deepdots_session_id).toBe('srv-9');
  });

  it('vuelca contexto (deepdots_platform, deepdots_language, deepdots_device_type, attributes) en metadata', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    const md = mdMap(body);
    expect(md.deepdots_platform).toBe('web');
    expect(md.deepdots_language).toBe('es-ES');
    expect(md.deepdots_device_type).toBe('mobile');
    expect(md.deepdots_user_agent).toBe('UA/1');
    expect(md.deepdots_app_version).toBe('1.2.3');
    expect(md.pass_type).toBe('premium'); // user attribute — sin prefijo deepdots_
  });

  it('marca completed en false, arrastra claves; sin feedbackSessionId, sessionId ausente del body', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.completed).toBe(false);
    expect(body.feedback.finished).toBe(false);
    expect(body.feedback.text).toBe('');
    expect(body.publicKey).toBe('pub-k');
    expect(body).not.toHaveProperty('privateKey');
    expect(body.integration).toBe('int-1');
    expect(body).not.toHaveProperty('sessionId');
  });

  it('incluye sessionId top-level cuando se pasa feedbackSessionId (agrupación backend)', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS, 'fbk-sess-1');
    expect(body.sessionId).toBe('fbk-sess-1');
  });

  it('con sessionEnd marca completed:true sobre el sessionId que se cierra (finished sigue false)', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS, 'fbk-sess-1', { sessionEnd: true });
    expect(body.completed).toBe(true);
    expect(body.sessionId).toBe('fbk-sess-1');
    // `finished` no es la señal de cierre acordada con backend: solo `completed`.
    expect(body.feedback.finished).toBe(false);
  });

  it('omite claves de metadata/profile sin valor (userId/session null, sin device)', () => {
    const body = buildAnalyticsFeedbackBody(
      envelope({ userId: null, sessionId: null, context: { platform: 'web', attributes: {} } }),
      KEYS,
    );
    expect(body.feedback.profile).toEqual([]);
    const keys = body.feedback.metadata.map((m) => m.key);
    expect(keys).not.toContain('deepdots_user_id');
    expect(keys).not.toContain('deepdots_session_id');
    expect(keys).not.toContain('deepdots_device_type');
    expect(keys).toContain('deepdots_platform');
    expect(body).not.toHaveProperty('sessionId');
  });
});

describe('createFeedbackSink', () => {
  it('hace POST a {baseUrl}/sdk/feedback con el body mapeado; eventos en metadata', () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    sink(envelope());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api-dev.deepdots.com/sdk/feedback');
    expect((init as RequestInit).method).toBe('POST');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.integration).toBe('int-1');
    expect(sent.completed).toBe(false);
    expect(sent.feedback.metrics).toEqual([]);
    const keys = sent.feedback.metadata.map((m: { key: string }) => m.key);
    expect(keys).toContain('deepdots_page_view');
    expect(keys).toContain('deepdots_user_engagement');
    const pv = sent.feedback.metadata.find((m: { key: string }) => m.key === 'deepdots_page_view');
    expect(pv.value).toBeInstanceOf(Array);
    expect(pv.value).toHaveLength(1);
  });

  it('envía con keepalive para que el navegador no cancele el POST al navegar fuera', () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    void sink(envelope());
    expect((fetchImpl.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  it('omite keepalive si el lote excede el límite del navegador (~64KB)', () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const huge = envelope({
      events: [{ name: 'deepdots_app_crash', timestamp: 1, params: { stack: 'x'.repeat(70_000) } }],
    });
    void sink(huge);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).keepalive).toBeUndefined();
  });

  /** Ids de sesión deterministas para los tests: s-1, s-2… */
  function ids() {
    let n = 0;
    return () => `s-${++n}`;
  }

  /** Respuesta OK de la API (devuelve el sessionId que se le mandó). */
  const ok = (init: RequestInit) => ({
    ok: true,
    json: async () => ({ sessionId: JSON.parse(init.body as string).sessionId }),
  });

  const bodiesOf = (fetchImpl: ReturnType<typeof vi.fn>) =>
    fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

  const eventNames = (body: { feedback: { metadata: { key: string; value: string[] }[] } }) =>
    body.feedback.metadata.filter((m) => m.value[0]?.startsWith('{')).map((m) => m.key);

  /**
   * Fallos de red y del backend. Un lote que falla de forma transitoria se guarda y se reenvía
   * TAL CUAL (con su sessionId y su `completed`) antes del lote siguiente. No se devuelve al
   * buffer del manager: allí se mezclaba con la sesión siguiente y viajaba con su registro.
   */
  describe('errores del backend', () => {
    it('en fallo transitorio (500, 408, 429, red) no rechaza y reenvía el lote antes del siguiente', async () => {
      for (const failure of [500, 503, 408, 429, 'network'] as const) {
        const fetchImpl = vi
          .fn()
          .mockImplementationOnce(async () => {
            if (failure === 'network') throw new TypeError('Network request failed');
            return { ok: false, status: failure, text: async () => 'upstream boom' };
          })
          .mockImplementation(async (_u: string, init: RequestInit) => ok(init));
        const sink = createFeedbackSink({
          baseUrl: 'https://api-dev.deepdots.com',
          keys: KEYS,
          fetchImpl: fetchImpl as unknown as typeof fetch,
          newSessionId: ids(),
        });

        await expect(sink(envelope())).resolves.toBeUndefined();
        await sink(envelope({ events: [{ name: 'deepdots_page_view', timestamp: 3000 }] }));

        const bodies = bodiesOf(fetchImpl);
        expect(bodies).toHaveLength(3);
        expect(bodies[1]).toEqual(bodies[0]); // el reintento es el mismo lote
        expect(eventNames(bodies[2])).toEqual(['deepdots_page_view']);
      }
    });

    it('loguea y descarta (sin reintento) un 4xx como el 406 Contact not found', async () => {
      const log = vi.fn();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 406, text: async () => 'Contact not found' })
        .mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log,
      });

      await expect(sink(envelope())).resolves.toBeUndefined();
      await sink(envelope());

      expect(fetchImpl).toHaveBeenCalledTimes(2); // el 406 no se reintenta
      const logged = log.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('406');
      expect(logged).toContain('Contact not found');
    });
  });

  /**
   * Cierre de página. El lote final es el ÚNICO que lleva `completed:true`, y sin él la API
   * no ensambla la sesión en un feedback: todo lo que llevaba (page_views incluidos) nunca
   * llega a BigQuery.
   *
   * ⚠️ Nada de `sendBeacon` (verificado en Chromium contra las cabeceras reales de
   * api.deepdots.com, 2026-09-25): la API responde `Access-Control-Allow-Origin: *` con
   * `Allow-Credentials: true`, `sendBeacon` va SIEMPRE con credenciales y un Blob
   * `application/json` obliga a preflight. Un preflight con credenciales no acepta `*`, así
   * que el navegador lo cortaba en el OPTIONS y el POST no salía nunca. `fetch` con
   * `keepalive` sobrevive igual al cierre y, sin credenciales, pasa ese mismo preflight.
   */
  describe('flush final (cierre de página)', () => {
    it('sale por fetch con keepalive, que sobrevive al cierre de la página', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await sink(envelope(), { final: true });

      expect(fetchImpl).toHaveBeenCalledOnce();
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-dev.deepdots.com/sdk/feedback');
      expect(init.keepalive).toBe(true);
    });

    it('ignora sendBeaconImpl aunque el host lo pase: el navegador lo cortaba en el preflight', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      const sendBeaconImpl = vi.fn().mockReturnValue(true);
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sendBeaconImpl,
      });

      await sink(envelope(), { final: true });

      expect(sendBeaconImpl).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledOnce();
    });

  });

  /**
   * La API autentica por `publicKey` en el body, nunca por cookie, y responde con
   * `Access-Control-Allow-Origin: *`. Cualquier petición CON credenciales falla el CORS
   * contra esa cabecera, así que se omiten de forma explícita en todos los lotes, no solo
   * en el final: no dependemos de que el default de `fetch` siga siendo el que es.
   */
  it.each([
    ['un lote normal', undefined],
    ['el lote final', { final: true }],
  ])('%s va sin credenciales', async (_label, meta) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await sink(envelope(), meta as never);

    expect((fetchImpl.mock.calls[0][1] as RequestInit).credentials).toBe('omit');
  });

  /**
   * El sessionId lo genera el SDK al abrir la sesión. Antes lo asignaba la API en la
   * respuesta del primer POST, y si esa respuesta no llegaba (la app iba a background con el
   * POST en vuelo: MOM, oct-2026) el resto de la sesión acababa en otro registro: sesiones
   * con solo `session_start`, cierres sin inicio y `mini_service_exit` sin su enter.
   */
  describe('sessionId generado en el cliente', () => {
    it('va desde el primer lote y los lotes siguientes no esperan a la respuesta', async () => {
      const fetchImpl = vi.fn().mockImplementation(() => new Promise(() => {})); // la API nunca responde
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: ids(),
      });

      void sink(envelope());
      void sink(envelope());
      await Promise.resolve();

      expect(bodiesOf(fetchImpl).map((b) => b.sessionId)).toEqual(['s-1', 's-1']);
    });

    it('por defecto es un UUID v4', async () => {
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await sink(envelope());

      expect(bodiesOf(fetchImpl)[0].sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('sigue en initialSessionId (sesión reanudada tras recargar la página)', async () => {
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        initialSessionId: 'resumed-1',
        newSessionId: ids(),
      });

      await sink(envelope());

      expect(bodiesOf(fetchImpl)[0].sessionId).toBe('resumed-1');
    });
  });

  /**
   * Fin de sesión: el último lote cierra el registro con `completed:true`, y el siguiente
   * abre otro con un sessionId nuevo (sesión o usuario nuevos).
   */
  describe('fin de sesión (completed:true)', () => {
    it('cierra el registro de la sesión y el lote siguiente abre otro con un id nuevo', async () => {
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: ids(),
      });

      await sink(envelope());
      await sink(envelope(), { sessionEnd: true });
      await sink(envelope());

      const bodies = bodiesOf(fetchImpl);
      expect(bodies[0]).toMatchObject({ completed: false, sessionId: 's-1' });
      expect(bodies[1]).toMatchObject({ completed: true, sessionId: 's-1' });
      expect(bodies[2]).toMatchObject({ completed: false, sessionId: 's-2' });
    });

    it('avisa por onSessionReset para que el host olvide el sessionId', async () => {
      const onSessionReset = vi.fn();
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch,
        onSessionReset,
      });

      await sink(envelope(), { sessionEnd: true });

      expect(onSessionReset).toHaveBeenCalledOnce();
    });

    it('avisa onSessionId una vez por sesión, cuando la API acepta su primer lote', async () => {
      const onSessionId = vi.fn();
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: ids(),
        onSessionId,
      });

      await sink(envelope());
      await sink(envelope());
      await sink(envelope(), { sessionEnd: true });
      await sink(envelope());

      expect(onSessionId.mock.calls).toEqual([['s-1'], ['s-2']]);
    });

    it('no da por abierta una sesión cuyo primer lote responde después del cierre', async () => {
      let resolveFirst!: (r: unknown) => void;
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
        .mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const onSessionId = vi.fn();
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: ids(),
        onSessionId,
      });

      const first = sink(envelope());
      await sink(envelope(), { sessionEnd: true });
      resolveFirst({ ok: true, json: async () => ({ sessionId: 's-1' }) });
      await first;

      expect(onSessionId).not.toHaveBeenCalled();
    });

    it('avisa por onSessionClosed con el sessionId del registro que cierra', async () => {
      const onSessionClosed = vi.fn();
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch,
        newSessionId: ids(),
        onSessionClosed,
      });

      await sink(envelope());
      expect(onSessionClosed).not.toHaveBeenCalled();
      await sink(envelope(), { sessionEnd: true });

      expect(onSessionClosed.mock.calls).toEqual([['s-1']]);
    });

    it('no avisa onSessionClosed si el backend rechaza el lote de cierre', async () => {
      const onSessionClosed = vi.fn();
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: vi
          .fn()
          .mockResolvedValue({ ok: false, status: 406, text: async () => 'Contact not found' }) as unknown as typeof fetch,
        onSessionClosed,
      });

      await sink(envelope(), { sessionEnd: true });

      expect(onSessionClosed).not.toHaveBeenCalled();
    });

    /**
     * MOM_PROD, 25-oct-2026: el lote de cierre llegaba a la API pero la app, ya en background,
     * no recibía la respuesta. El SDK lo daba por fallido, lo devolvía al buffer y salía con el
     * primer lote de la sesión SIGUIENTE: su `mini_service_exit` aparecía en otro registro,
     * sin enter (133 exits frente a 130 enters).
     */
    it('un cierre que falla se reintenta en SU registro, no en el de la sesión siguiente', async () => {
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(async (_u: string, init: RequestInit) => ok(init)) // s-1 abre
        .mockRejectedValueOnce(new TypeError('Network request failed')) // cierre de s-1
        .mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: ids(),
      });
      const close = envelope({
        events: [{ name: 'deepdots_mini_service_exit', timestamp: 5000, params: { mini_service: 'scan' } }],
      });
      const next = envelope({ events: [{ name: 'deepdots_session_start', timestamp: 9000 }] });

      await sink(envelope());
      await sink(close, { sessionEnd: true });
      await sink(next);

      const bodies = bodiesOf(fetchImpl);
      const retried = bodies.filter((b) => b.sessionId === 's-1' && b.completed);
      expect(retried).toHaveLength(2); // el intento fallido y el reintento, los dos a s-1
      expect(eventNames(retried[1])).toEqual(['deepdots_mini_service_exit']);
      const s2 = bodies.filter((b) => b.sessionId === 's-2');
      expect(s2).toHaveLength(1);
      expect(eventNames(s2[0])).toEqual(['deepdots_session_start']);
    });
  });

  /**
   * Con `storage` (React Native: MMKV) los lotes pendientes sobreviven a que la app muera: el
   * de cierre se guarda ANTES de enviarse y cualquiera que falle se queda hasta entregarse.
   * El sink del arranque siguiente los reenvía a su registro.
   */
  describe('pendientes persistidos (storage)', () => {
    const flushAsync = () => new Promise((r) => setTimeout(r, 0));

    it('reenvía al arrancar el cierre que no llegó a salir, con su sessionId y completed', async () => {
      const storage = new InMemoryStorage();
      const dying = vi.fn().mockImplementation(() => new Promise(() => {})); // la app muere sin respuesta
      const before = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: dying as unknown as typeof fetch,
        newSessionId: () => 'old-1',
        storage,
      });
      void before(envelope(), { sessionEnd: true });
      await flushAsync();

      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const onSessionClosed = vi.fn();
      createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        newSessionId: () => 'new-1',
        storage,
        onSessionClosed,
      });
      await flushAsync();

      const bodies = bodiesOf(fetchImpl);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ sessionId: 'old-1', completed: true });
      expect(onSessionClosed).toHaveBeenCalledWith('old-1');

      // entregado: el siguiente arranque ya no lo repite
      const again = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      createFeedbackSink({ baseUrl: 'https://api-dev.deepdots.com', keys: KEYS, fetchImpl: again as unknown as typeof fetch, storage });
      await flushAsync();
      expect(again).not.toHaveBeenCalled();
    });

    it('reenvía al arrancar un lote normal que falló', async () => {
      const storage = new InMemoryStorage();
      const failing = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
      const before = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: failing as unknown as typeof fetch,
        newSessionId: () => 'old-1',
        storage,
      });
      await before(envelope());

      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      createFeedbackSink({ baseUrl: 'https://api-dev.deepdots.com', keys: KEYS, fetchImpl: fetchImpl as unknown as typeof fetch, storage });
      await flushAsync();

      expect(bodiesOf(fetchImpl)).toEqual([expect.objectContaining({ sessionId: 'old-1', completed: false })]);
    });

    it('no guarda los lotes normales que se entregan', async () => {
      const storage = new InMemoryStorage();
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        storage,
      });

      await sink(envelope());
      await sink(envelope(), { sessionEnd: true });

      const again = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      createFeedbackSink({ baseUrl: 'https://api-dev.deepdots.com', keys: KEYS, fetchImpl: again as unknown as typeof fetch, storage });
      await flushAsync();
      expect(again).not.toHaveBeenCalled();
    });

    it('descarta los pendientes de más de 24 h y los de otra integración', async () => {
      const storage = new InMemoryStorage();
      let now = Date.UTC(2026, 9, 25);
      const failing = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
      await createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: failing as unknown as typeof fetch,
        storage,
        now: () => now,
      })(envelope());

      const otherIntegration = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: { publicKey: 'pub-k', integration: 'int-2' },
        fetchImpl: otherIntegration as unknown as typeof fetch,
        storage,
        now: () => now,
      });
      await flushAsync();
      expect(otherIntegration).not.toHaveBeenCalled();

      now += 24 * 60 * 60 * 1000 + 1;
      const late = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: late as unknown as typeof fetch,
        storage,
        now: () => now,
      });
      await flushAsync();
      expect(late).not.toHaveBeenCalled();
    });

    it('un storage que falla no rompe el envío', async () => {
      const storage = {
        getItem: () => { throw new Error('boom'); },
        setItem: () => { throw new Error('boom'); },
        removeItem: () => { throw new Error('boom'); },
      };
      const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => ok(init));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        storage,
      });

      await sink(envelope(), { sessionEnd: true });

      expect(fetchImpl).toHaveBeenCalledOnce();
    });
  });
});
