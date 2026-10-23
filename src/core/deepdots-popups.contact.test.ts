import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

/**
 * setContactAttributes(): envía la info interna del usuario (que solo conoce el host)
 * al backend vía `POST /sdk/popups/contact`, identificada por el `userId` del init.
 * Gated por trackingEnabled AND userId presente (solo trackeamos usuarios identificados).
 */
describe('DeepdotsPopups — setContactAttributes', () => {
  let popups: DeepdotsPopups;

  /** Mock de fetch que registra las llamadas (URL + body parseado). */
  function mockFetch() {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (url: unknown, opts?: { method?: string; body?: string }) => {
      calls.push({
        url: String(url),
        method: opts?.method ?? 'GET',
        body: opts?.body ? JSON.parse(opts.body) : undefined,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '[]',
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('con userId, hace POST /sdk/popups/contact con publicKey + userId + userAttributes', async () => {
    const calls = mockFetch();
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'user123', storage: new InMemoryStorage() });

    await popups.setContactAttributes({ language: 'es', age: 34 });

    const contactCall = calls.find((c) => c.url.includes('/sdk/popups/contact') && c.method === 'POST');
    expect(contactCall).toBeDefined();
    expect(contactCall!.body).toEqual({
      publicKey: 'pk',
      userId: 'user123',
      userAttributes: { language: 'es', age: 34 },
    });
  });

  it('sin userId NO envía contact (solo trackeamos usuarios identificados)', async () => {
    const calls = mockFetch();
    popups.init({ apiKey: 'pk', nodeEnv: 'development', storage: new InMemoryStorage() });

    await popups.setContactAttributes({ language: 'es' });

    expect(calls.some((c) => c.url.includes('/sdk/popups/contact'))).toBe(false);
  });

  it('envía los contactAttributes pasados en init()', async () => {
    const calls = mockFetch();
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'user123', storage: new InMemoryStorage(), contactAttributes: { plan: 'premium' } });

    // init dispara el envío fire-and-forget; espera un tick
    await new Promise((r) => setTimeout(r, 0));

    const contactCall = calls.find((c) => c.url.includes('/sdk/popups/contact') && c.method === 'POST');
    expect(contactCall).toBeDefined();
    expect(contactCall!.body).toEqual({ publicKey: 'pk', userId: 'user123', userAttributes: { plan: 'premium' } });
  });

  it('con trackingEnabled=false NO envía contact', async () => {
    const calls = mockFetch();
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'user123', trackingEnabled: false, storage: new InMemoryStorage() });

    await popups.setContactAttributes({ language: 'es' });

    expect(calls.some((c) => c.url.includes('/sdk/popups/contact'))).toBe(false);
  });

  it('si la API responde con error, la llamada siguiente reintenta (no se queda cacheado)', async () => {
    const calls: { url: string; ok: boolean }[] = [];
    let contactStatus = 503;
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      const isContact = String(url).includes('/sdk/popups/contact');
      const status = isContact ? contactStatus : 200;
      calls.push({ url: String(url), ok: status < 400 });
      return { ok: status < 400, status, statusText: '', json: async () => ({}), text: async () => '[]' } as unknown as Response;
    }));
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'user123', storage: new InMemoryStorage() });

    expect(await popups.setContactAttributes({ plan: 'premium' })).toBe(false);
    contactStatus = 200;
    expect(await popups.setContactAttributes({ plan: 'premium' })).toBe(true);

    expect(calls.filter((c) => c.url.includes('/sdk/popups/contact'))).toHaveLength(2);
  });

  it('si fetch rechaza (sin red), la llamada siguiente reintenta', async () => {
    let offline = true;
    let contactPosts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      if (String(url).includes('/sdk/popups/contact')) {
        contactPosts++;
        if (offline) throw new TypeError('Failed to fetch');
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '[]' } as unknown as Response;
    }));
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'user123', storage: new InMemoryStorage() });

    expect(await popups.setContactAttributes({ plan: 'premium' })).toBe(false);
    offline = false;
    expect(await popups.setContactAttributes({ plan: 'premium' })).toBe(true);
    expect(contactPosts).toBe(2);
  });
});
