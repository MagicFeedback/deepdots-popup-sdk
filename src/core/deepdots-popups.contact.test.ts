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
});
