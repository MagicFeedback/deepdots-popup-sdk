import { describe, expect, it, vi } from 'vitest';
import { buildAnalyticsFeedbackBody, createFeedbackSink } from './feedback-payload';
import type { AnalyticsEnvelope } from './analytics-manager';

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

  it('cachea el sessionId de la respuesta y lo envía en la siguiente llamada', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'fbk-sess-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // Primera llamada — sin sessionId en el body
    sink(envelope());
    await new Promise((r) => setTimeout(r, 0));

    // Segunda llamada — debe incluir el sessionId cacheado
    sink(envelope());
    const [, init2] = fetchImpl.mock.calls[1];
    const sent2 = JSON.parse((init2 as RequestInit).body as string);
    expect(sent2.sessionId).toBe('fbk-sess-1');

    // Y la primera NO lo tenía
    const [, init1] = fetchImpl.mock.calls[0];
    const sent1 = JSON.parse((init1 as RequestInit).body as string);
    expect(sent1).not.toHaveProperty('sessionId');
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

  describe('errores del backend', () => {
    it('rechaza (para que el manager re-encole) en fallo transitorio: 500, 408, 429', async () => {
      for (const status of [500, 503, 408, 429]) {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status, text: async () => 'upstream boom' });
        const sink = createFeedbackSink({
          baseUrl: 'https://api-dev.deepdots.com',
          keys: KEYS,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        await expect(sink(envelope())).rejects.toThrow(new RegExp(String(status)));
      }
    });

    it('loguea y descarta (sin reintento) un 4xx como el 406 Contact not found', async () => {
      const log = vi.fn();
      const fetchImpl = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 406, text: async () => 'Contact not found' });
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log,
      });

      await expect(sink(envelope())).resolves.toBeUndefined(); // no reintentable
      const logged = log.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('406');
      expect(logged).toContain('Contact not found');
    });

    it('rechaza cuando fetch falla por red', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await expect(sink(envelope())).rejects.toThrow('Failed to fetch');
    });
  });

  it('serializa los lotes hasta conocer el sessionId (no crea dos registros en paralelo)', async () => {
    let resolveFirst!: (v: unknown) => void;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue({ ok: true, json: async () => ({ sessionId: 'fbk-1' }) });
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: KEYS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const first = sink(envelope());
    const second = sink(envelope()); // sale antes de que responda el primero

    // el segundo lote NO se envía todavía: espera al sessionId del primero
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledOnce();

    resolveFirst({ ok: true, json: async () => ({ sessionId: 'fbk-1' }) });
    await first;
    await second;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const sent2 = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
    expect(sent2.sessionId).toBe('fbk-1'); // agrupado en el mismo registro
  });

  describe('flush final (cierre de página)', () => {
    it('usa sendBeacon, que sobrevive al unload, en vez de fetch', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      const sendBeaconImpl = vi.fn().mockReturnValue(true);
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sendBeaconImpl,
      });

      await sink(envelope(), { final: true });

      expect(sendBeaconImpl).toHaveBeenCalledOnce();
      expect(fetchImpl).not.toHaveBeenCalled();
      const [beaconUrl] = sendBeaconImpl.mock.calls[0];
      expect(beaconUrl).toBe('https://api-dev.deepdots.com/sdk/feedback');
    });

    it('cae a fetch si sendBeacon rechaza el lote (cola del navegador llena)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      const sendBeaconImpl = vi.fn().mockReturnValue(false);
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sendBeaconImpl,
      });

      await sink(envelope(), { final: true });

      expect(sendBeaconImpl).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it('no espera al primer POST en vuelo: la página se muere, mejor enviar sin sessionId', async () => {
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(() => new Promise(() => {})) // primer POST nunca responde
        .mockResolvedValue({ ok: true, json: async () => ({}) });
      const sendBeaconImpl = vi.fn().mockReturnValue(true);
      const sink = createFeedbackSink({
        baseUrl: 'https://api-dev.deepdots.com',
        keys: KEYS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sendBeaconImpl,
      });

      void sink(envelope());
      await sink(envelope(), { final: true }); // no se queda colgado

      expect(sendBeaconImpl).toHaveBeenCalledOnce();
    });
  });
});
