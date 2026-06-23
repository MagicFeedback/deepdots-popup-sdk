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
      { name: 'page_view', timestamp: 1000, params: { screen: '/home', duration_seconds: 5 } },
      { name: 'user_engagement', timestamp: 2000, params: { engagement_time_msec: 4200 } },
    ],
    ...overrides,
  };
}

describe('buildAnalyticsFeedbackBody', () => {
  it('mapea cada evento a una metric {key: nombre, value: JSON(timestamp+params)}; answers vacío', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.feedback.metrics).toEqual([
      { key: 'page_view', value: JSON.stringify({ timestamp: 1000, screen: '/home', duration_seconds: 5 }) },
      { key: 'user_engagement', value: JSON.stringify({ timestamp: 2000, engagement_time_msec: 4200 }) },
    ]);
    expect(body.feedback.answers).toEqual([]);
  });

  it('pone la identidad en profile (external-user-id) y user_id/session_id en metadata', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.feedback.profile).toEqual([{ key: 'external-user-id', value: 'u-1' }]);
    const md = Object.fromEntries(body.feedback.metadata.map((m) => [m.key, m.value]));
    expect(md.user_id).toBe('u-1');
    expect(md.session_id).toBe('srv-9');
  });

  it('vuelca contexto (platform, language, device, attributes) en metadata', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    const md = Object.fromEntries(body.feedback.metadata.map((m) => [m.key, m.value]));
    expect(md.platform).toBe('web');
    expect(md.language).toBe('es-ES');
    expect(md.device_type).toBe('mobile');
    expect(md.user_agent).toBe('UA/1');
    expect(md.app_version).toBe('1.2.3');
    expect(md.pass_type).toBe('premium'); // user attribute
  });

  it('marca completed/finished en false, arrastra claves; sin feedbackSessionId, sessionId ausente del body', () => {
    const body = buildAnalyticsFeedbackBody(envelope(), KEYS);
    expect(body.completed).toBe(false);
    expect(body.finished).toBe(false);
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
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('session_id');
    expect(keys).not.toContain('device_type');
    expect(keys).toContain('platform');
    expect(body).not.toHaveProperty('sessionId');
  });
});

describe('createFeedbackSink', () => {
  it('hace POST a {baseUrl}/sdk/feedback con el body mapeado', () => {
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
    expect(sent.feedback.metrics).toHaveLength(2);
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
    await new Promise((r) => setTimeout(r, 0)); // deja que la Promise de la respuesta resuelva

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
});
