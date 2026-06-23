import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';

describe('DeepdotsPopups analytics (canal separado, dry-run)', () => {
  let popups: DeepdotsPopups;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({ apiKey: 'pk-1' });
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
    expect(preview.events[0]).toMatchObject({ name: 'cta_click', params: { label: 'comprar' } });
  });

  it('setUserAttributes() alimenta el context para breakdowns', () => {
    popups.setUserAttributes({ registration_status: 'registered', pass_type: 'premium' });
    expect(popups.previewAnalytics().context.attributes).toMatchObject({
      registration_status: 'registered',
      pass_type: 'premium',
    });
  });

  it('enterMiniService() etiqueta los eventos siguientes', () => {
    popups.enterMiniService('checkout', 'home');
    popups.track('task_started', { task_id: 't-9' });

    const names = popups.previewAnalytics().events.map((e) => e.name);
    expect(names).toEqual(['mini_service_enter', 'task_started']);
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
    expect(body.feedback.metrics.some((m: any) => m.key === 'page_view')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('con tracking desactivado, track() es no-op', () => {
    popups.setTrackingEnabled(false);
    popups.track('cta_click');
    expect(popups.previewAnalytics().events).toHaveLength(0);
  });

  it('trackSearch emite un evento search con la convención de findability (#31/#35)', () => {
    popups.trackSearch('zapatos', 0);
    const e = popups.previewAnalytics().events.find((x) => x.name === 'search');
    expect(e?.params).toMatchObject({ query: 'zapatos', results_count: 0, has_results: false });
  });

  it('trackFindabilityFriction emite findability_friction con friction_topic (#34/#35)', () => {
    popups.trackFindabilityFriction('checkout_address', { source: 'search' });
    const e = popups.previewAnalytics().events.find((x) => x.name === 'findability_friction');
    expect(e?.params).toMatchObject({ friction_topic: 'checkout_address', source: 'search' });
  });

  it('trackFunnelStep emite funnel_step con funnel/step/task_id (Funnel)', () => {
    popups.trackFunnelStep('outstanding_task', 'task_started', 'task-42');
    const e = popups.previewAnalytics().events.find((x) => x.name === 'funnel_step');
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
});
