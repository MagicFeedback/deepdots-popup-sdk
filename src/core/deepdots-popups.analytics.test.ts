import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

describe('DeepdotsPopups analytics (canal separado, dry-run)', () => {
  let popups: DeepdotsPopups;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({ apiKey: 'pk-1' });
    // Flush the deepdots_session_start emitted during init so existing event-count tests start clean.
    popups.flushAnalytics();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('track() acumula eventos vinculados al user_id', () => {
    popups.track('cta_click', { label: 'comprar' });

    const preview = popups.previewAnalytics();
    expect(preview.userId).toBeTruthy();
    expect(preview.publicKey).toBe('pk-1');
    expect(preview.events).toHaveLength(1);
    expect(preview.events[0]).toMatchObject({ name: 'deepdots_event_cta_click', params: { label: 'comprar' } });
  });

  it('los eventos custom del host se prefijan con deepdots_event_', () => {
    popups.track('cta_click', { label: 'comprar' });
    popups.track('add_to_cart');
    const names = popups.previewAnalytics().events.map((e) => e.name);
    expect(names).toEqual(['deepdots_event_cta_click', 'deepdots_event_add_to_cart']);
  });

  it('los eventos reservados del SDK (namespace deepdots_) no se re-prefijan', () => {
    popups.track('deepdots_page_view', { screen: '/home' });
    popups.trackMessage('delivered', { id: 'm-1', channel: 'push' });
    const names = popups.previewAnalytics().events.map((e) => e.name);
    expect(names).toContain('deepdots_page_view');
    expect(names).toContain('deepdots_message');
    expect(names.some((n) => n.startsWith('deepdots_event_'))).toBe(false);
  });

  it('setUserAttributes() alimenta el context para breakdowns', () => {
    popups.setUserAttributes({ registration_status: 'registered', pass_type: 'premium' });
    expect(popups.previewAnalytics().context.attributes).toMatchObject({
      registration_status: 'registered',
      pass_type: 'premium',
    });
  });

  it('setMetric() alimenta context.metrics y respeta el kill-switch', () => {
    popups.setMetric('cart_value', 49.99);
    popups.setMetric('items_in_cart', 3);
    expect(popups.previewAnalytics().context.metrics).toMatchObject({
      cart_value: '49.99',
      items_in_cart: '3',
    });

    popups.setTrackingEnabled(false);
    popups.setMetric('ignored', 1);
    expect(popups.previewAnalytics().context.metrics).not.toHaveProperty('ignored');
  });

  it('enterMiniService() etiqueta los eventos siguientes', () => {
    popups.enterMiniService('checkout', 'home');
    popups.track('task_started', { task_id: 't-9' });

    const names = popups.previewAnalytics().events.map((e) => e.name);
    expect(names).toEqual(['deepdots_mini_service_enter', 'deepdots_event_task_started']);
    expect(popups.previewAnalytics().events[1].params).toMatchObject({ mini_service: 'checkout', task_id: 't-9' });
  });

  it('flushAnalytics() pinta por consola el payload (dry-run) y vacía el buffer', () => {
    popups.track('page_view', { screen: '/home' });
    popups.flushAnalytics();

    expect(logSpy).toHaveBeenCalled();
    const printed = logSpy.mock.calls.flat().some((a) => typeof a === 'string' && a.includes('/sdk/feedback'));
    expect(printed).toBe(true);
    expect(popups.previewAnalytics().events).toHaveLength(0);
  });

  it('con init.analytics, flushAnalytics() hace POST real a /sdk/feedback', () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true } as any);
    vi.stubGlobal('fetch', fetchSpy);
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration: 'int-7' },
    });

    sdk.track('page_view', { screen: '/home' });
    sdk.flushAnalytics();

    const call = fetchSpy.mock.calls.find(([u]) => typeof u === 'string' && u.endsWith('/sdk/feedback'));
    expect(call).toBeTruthy();
    expect(call![0]).toBe('https://api-dev.deepdots.com/sdk/feedback');
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.integration).toBe('int-7');
    expect(body.completed).toBe(false);
    expect(body.feedback.metadata.some((m: any) => m.key === 'deepdots_event_page_view')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('con tracking desactivado, track() es no-op', () => {
    popups.setTrackingEnabled(false);
    popups.track('cta_click');
    expect(popups.previewAnalytics().events).toHaveLength(0);
  });

  it('trackSearch emite un evento search con la convención de findability (#31/#35)', () => {
    popups.trackSearch('zapatos', 0);
    const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_search');
    expect(e?.params).toMatchObject({ query: 'zapatos', results_count: 0, has_results: false });
  });

  it('trackFindabilityFriction emite findability_friction con friction_topic (#34/#35)', () => {
    popups.trackFindabilityFriction('checkout_address', { source: 'search' });
    const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_findability_friction');
    expect(e?.params).toMatchObject({ friction_topic: 'checkout_address', source: 'search' });
  });

  it('trackFunnelStep emite funnel_step con funnel/step/task_id (Funnel)', () => {
    popups.trackFunnelStep('outstanding_task', 'task_started', 'task-42');
    const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_funnel_step');
    expect(e?.params).toMatchObject({ funnel: 'outstanding_task', step: 'task_started', task_id: 'task-42' });
  });

  it('los helpers respetan el kill-switch', () => {
    popups.setTrackingEnabled(false);
    popups.trackSearch('x', 1);
    popups.trackFunnelStep('f', 's', 't');
    popups.trackFindabilityFriction('topic');
    expect(popups.previewAnalytics().events).toHaveLength(0);
  });
  // Nota: la navegación real (History API → page_view) se valida en E2E (Chromium),
  // porque happy-dom no simula fielmente pushState/location.

  it('emite deepdots_session_start al init y deepdots_app_crash en reportError', () => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1' });

    const names0 = sdk.previewAnalytics().events.map((e) => e.name);
    expect(names0).toContain('deepdots_session_start');

    sdk.reportError(new TypeError('kaboom'), { severity: 'error', context: { screen: 'Home' } });
    const crash = sdk.previewAnalytics().events.find((e) => e.name === 'deepdots_app_crash');
    expect(crash?.params).toMatchObject({
      crash_type: 'TypeError', message: 'kaboom', severity: 'error', handled: true, ctx_screen: 'Home',
    });
  });

  it('reenvía crashes pendientes de disco en init (replay → deepdots_app_crash)', () => {
    const storage = new InMemoryStorage();
    const pending = [{
      crashedAt: 111, crashType: 'RangeError', message: 'old crash', stack: '', fatal: true,
      handled: false, severity: 'fatal', sessionId: null, appVersion: '0.9.0',
    }];
    storage.setItem('deepdots.crash.queue', JSON.stringify(pending));

    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1', storage });

    const crash = sdk.previewAnalytics().events.find((e) => e.name === 'deepdots_app_crash');
    expect(crash?.params).toMatchObject({
      crashed_at: 111, crash_type: 'RangeError', crashed_app_version: '0.9.0', fatal: true,
    });
    expect(storage.getItem('deepdots.crash.queue')).toBeNull();
  });

  it('con trackingEnabled:false no emite deepdots_session_start ni captura reportError', () => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1', trackingEnabled: false });

    sdk.reportError(new Error('x'));
    const names = sdk.previewAnalytics().events.map((e) => e.name);
    expect(names).not.toContain('deepdots_session_start');
    expect(names).not.toContain('deepdots_app_crash');
  });

  it('trackMessage emite deepdots_message con stage + message_id/title/channel (#18–22)', () => {
    popups.trackMessage('delivered', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push', campaign: 'summer_sale' });
    popups.trackMessage('clicked', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push' });
    popups.trackMessage('converted', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push', value: 49.9, currency: 'EUR' });

    const msgs = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_message');
    expect(msgs).toHaveLength(3);
    expect(msgs[0].params).toMatchObject({ stage: 'delivered', message_id: 'msg-42', message_title: 'Rebajas de verano', channel: 'push', campaign: 'summer_sale' });
    expect(msgs[2].params).toMatchObject({ stage: 'converted', value: 49.9, currency: 'EUR' });
  });

  /**
   * Protecciones del funnel de Messaging: el SDK no puede emitir las formas imposibles que
   * producían CTR > 100% en BQ (stage duplicado, dos canales para el mismo message_id).
   */
  it('trackMessage descarta channel inválido, stage duplicado y cambio de canal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = { id: 'msg-1', title: 'Rebajas' };

    popups.trackMessage('delivered', { ...m, channel: 'PUSH' as 'push' }); // inválido
    popups.trackMessage('delivered', { ...m, channel: 'push' }); // ok
    popups.trackMessage('clicked', { ...m, channel: 'push' }); // ok
    popups.trackMessage('clicked', { ...m, channel: 'push' }); // duplicado
    popups.trackMessage('clicked', { ...m, channel: 'in_app' }); // conflicto de canal

    const msgs = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_message');
    expect(msgs.map((e) => e.params?.stage)).toEqual(['delivered', 'clicked']);
    expect(msgs.every((e) => e.params?.channel === 'push')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('el guard de messaging tiene vigencia de sesión: otra sesión vuelve a aceptar el mismo mensaje', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = { id: 'msg-1', title: 'Rebajas', channel: 'push' as const };
    popups.trackMessage('clicked', m);

    const otra = new DeepdotsPopups();
    otra.setRenderer(new NoopPopupRenderer());
    otra.init({ apiKey: 'pk-1' });
    otra.trackMessage('clicked', m);

    const msgs = otra.previewAnalytics().events.filter((e) => e.name === 'deepdots_message');
    expect(msgs).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  /**
   * Al cerrar la pestaña el navegador puede cancelar un fetch en vuelo: ese último lote
   * (con el page_view y el engagement finales) se perdía. El flush de `pagehide` va por
   * sendBeacon, que sobrevive al unload.
   */
  it('el flush de pagehide sale por sendBeacon, no por fetch', () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);

    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration: 'int-7' },
    });
    sdk.track('cta_click');
    window.dispatchEvent(new Event('pagehide'));

    expect(beacon).toHaveBeenCalled();
    expect(beacon.mock.calls[0][0]).toBe('https://api-dev.deepdots.com/sdk/feedback');
    expect(fetchSpy.mock.calls.some(([u]) => typeof u === 'string' && u.endsWith('/sdk/feedback'))).toBe(false);

    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });
});
