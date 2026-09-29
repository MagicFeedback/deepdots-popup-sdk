import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { DEFAULT_GEO_PROVIDERS, GEO_TTL_MS, writeCachedGeo } from '../analytics/geo-info';

/**
 * Cuándo se hace el lookup de geolocalización por IP (terceros: ipapi.co, ipwho.is, ipinfo.io).
 * Reportado por un cliente: se hacía en cada init(), sin analytics y con el tracking apagado.
 * Regla: solo si el país/ciudad se va a ENVIAR (analytics configurado + tracking activo +
 * `geolocation` no desactivado) y la caché no está fresca; como mucho una vez por instancia.
 */

const ANALYTICS = { publicKey: 'pk', integration: 'int' };
const GEO_URLS = DEFAULT_GEO_PROVIDERS.map((p) => p.url);

function isGeoCall(url: unknown): boolean {
  return typeof url === 'string' && GEO_URLS.includes(url);
}

/** Deja correr las promesas pendientes (el lookup es fire-and-forget). */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('DeepdotsPopups · geolocalización por IP', () => {
  let popups: DeepdotsPopups;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let storage: InMemoryStorage;

  const geoCalls = () => fetchSpy.mock.calls.filter(([url]) => isGeoCall(url));

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    storage = new InMemoryStorage();
    fetchSpy = vi.fn().mockImplementation(async (url: unknown) =>
      isGeoCall(url)
        ? ({ ok: true, json: async () => ({ country_code: 'DK', city: 'Aarhus' }) } as Response)
        : ({ ok: true, json: async () => [] } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchSpy);
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin analytics configurado NO hace el lookup (el dato no iría a ninguna parte)', async () => {
    popups.init({ apiKey: 'k', storage });
    await settle();
    expect(geoCalls()).toHaveLength(0);
  });

  it('con analytics y tracking activo hace el lookup y rellena country/city', async () => {
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS });
    await settle();
    expect(geoCalls()).toHaveLength(1);
    expect(popups.previewAnalytics().context.device).toMatchObject({ country: 'DK', city: 'Aarhus' });
  });

  it('con trackingEnabled:false NO hace el lookup hasta que se concede el consentimiento', async () => {
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS, trackingEnabled: false });
    await settle();
    expect(geoCalls()).toHaveLength(0);

    popups.setTrackingEnabled(true);
    await settle();
    expect(geoCalls()).toHaveLength(1);
  });

  it('hace como mucho un lookup por instancia aunque el consentimiento cambie varias veces', async () => {
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS });
    await settle();
    popups.setTrackingEnabled(false);
    popups.setTrackingEnabled(true);
    popups.setTrackingEnabled(true);
    await settle();
    expect(geoCalls()).toHaveLength(1);
  });

  it('con la caché fresca NO hace el lookup y usa el valor cacheado', async () => {
    writeCachedGeo(storage, { country: 'ES', city: 'Madrid' }, Date.now());
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS });
    await settle();
    expect(geoCalls()).toHaveLength(0);
    expect(popups.previewAnalytics().context.device).toMatchObject({ country: 'ES', city: 'Madrid' });
  });

  it('con la caché caducada vuelve a hacer el lookup y la reescribe', async () => {
    writeCachedGeo(storage, { country: 'ES', city: 'Madrid' }, Date.now() - GEO_TTL_MS - 1);
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS });
    await settle();
    expect(geoCalls()).toHaveLength(1);
    expect(popups.previewAnalytics().context.device).toMatchObject({ country: 'DK', city: 'Aarhus' });
  });

  it('geolocation:false lo desactiva del todo: ni lookup ni valor cacheado', async () => {
    writeCachedGeo(storage, { country: 'ES', city: 'Madrid' }, Date.now() - GEO_TTL_MS - 1);
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS, geolocation: false });
    popups.setTrackingEnabled(true);
    await settle();
    expect(geoCalls()).toHaveLength(0);
    const device = popups.previewAnalytics().context.device;
    expect(device?.country).toBeUndefined();
    expect(device?.city).toBeUndefined();
  });

  it('geolocation:false no aplica tampoco una caché fresca de una versión anterior', () => {
    writeCachedGeo(storage, { country: 'ES', city: 'Madrid' }, Date.now());
    popups.init({ apiKey: 'k', storage, analytics: ANALYTICS, geolocation: false });
    expect(popups.previewAnalytics().context.device?.country).toBeUndefined();
  });
});
