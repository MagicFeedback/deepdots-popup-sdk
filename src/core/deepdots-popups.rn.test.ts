import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage, STORAGE_KEYS } from '../tracking/tracking-manager';
import { writeCachedGeo } from '../analytics/geo-info';

/**
 * Puntos de inyección para React Native (SDK JS sin APIs de navegador):
 * storage inyectable, platform/device inyectables, navegación manual (setScreen),
 * y lifecycle manual (onForeground/onBackground).
 */
describe('DeepdotsPopups — inyección RN', () => {
  let popups: DeepdotsPopups;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });

  it('persiste el user_id en el storage inyectado (AsyncStorage adapter en RN)', () => {
    const storage = new InMemoryStorage();
    popups.init({ apiKey: 'k', storage });
    const uid = popups.getUserId();
    expect(uid).toBeTruthy();
    expect(storage.getItem(STORAGE_KEYS.userId)).toBe(uid);

    // "segundo arranque" con el mismo storage → mismo user_id (returning)
    const popups2 = new DeepdotsPopups();
    popups2.setRenderer(new NoopPopupRenderer());
    popups2.init({ apiKey: 'k', storage });
    expect(popups2.getUserId()).toBe(uid);
  });

  it('usa la platform y el device inyectados por el host', () => {
    const device = { device_type: 'mobile' as const, os_version: '17.4', device_model: 'iPhone15,2', app_version: '3.1.0' };
    popups.init({ apiKey: 'k', platform: 'ios', device });
    const ctx = popups.previewAnalytics().context;
    expect(ctx.platform).toBe('ios');
    expect(ctx.device).toEqual(device);
  });

  it('aplica el geo cacheado en storage de inmediato al init (sin red)', () => {
    const storage = new InMemoryStorage();
    writeCachedGeo(storage, { country: 'ES', city: 'Madrid' }, Date.now());
    popups.init({ apiKey: 'k', platform: 'ios', storage });
    const device = popups.previewAnalytics().context.device;
    expect(device?.country).toBe('ES');
    expect(device?.city).toBe('Madrid');
  });

  it('usa el language explícito del init en el context de analytics', () => {
    popups.init({ apiKey: 'k', platform: 'ios', language: 'fr-CA' });
    expect(popups.previewAnalytics().context.language).toBe('fr-CA');
  });

  it('setScreen() emite page_view manual (React Navigation)', () => {
    popups.init({ apiKey: 'k', platform: 'android' });
    popups.setScreen('/home');
    popups.setScreen('/producto/123');
    const pv = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_page_view');
    expect(pv.map((e) => e.params?.screen)).toContain('/home');
  });

  it('onBackground() cierra el mini-service y hace flush del lote (dry-run)', () => {
    popups.init({ apiKey: 'k', platform: 'android' });
    popups.onForeground();
    popups.enterMiniService('checkout', 'home');
    popups.onBackground();

    // onBackground emite mini_service_exit y FLUSHEA → el buffer queda vacío
    expect(popups.previewAnalytics().events).toHaveLength(0);
    // el payload flusheado (dry-run → console.log) contiene el cierre del mini-service
    const printed = logSpy.mock.calls.flat().map(String).join(' ');
    expect(printed).toContain('/sdk/feedback');
    expect(printed).toContain('deepdots_mini_service_exit');
  });
});
