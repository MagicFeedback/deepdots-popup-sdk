import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsManager, type AnalyticsEnvelope } from './analytics-manager';

/**
 * Analytics = canal SEPARADO del feedback (send()). Eventos GA-style enviados a un
 * endpoint propio, vinculados por user_id. Aquí el "envío" es un sink inyectable; en
 * producción será un POST. El sink por defecto hace console.log (dry-run).
 */
describe('AnalyticsManager', () => {
  let now: number;
  let sink: ReturnType<typeof vi.fn>;
  let am: AnalyticsManager;

  beforeEach(() => {
    now = 1_000;
    sink = vi.fn();
    am = new AnalyticsManager({ sink, now: () => now, publicKey: 'pk-1' });
  });

  const identity = { userId: 'u-1', sessionId: 's-1' };

  it('buffers tracked events with name, timestamp and params', () => {
    am.track('cta_click', { label: 'comprar' });
    expect(am.pending()).toBe(1);

    const payload = am.buildPayload(identity);
    expect(payload.events).toEqual([
      { name: 'cta_click', timestamp: 1000, params: { label: 'comprar' } },
    ]);
  });

  it('merges user attributes into the envelope context (coerced to string)', () => {
    am.setUserAttributes({ registration_status: 'registered', pass_type: 'premium' });
    am.setUserAttributes({ sector: 'retail', vip: true });

    const ctx = am.buildPayload(identity).context;
    expect(ctx.attributes).toEqual({
      registration_status: 'registered',
      pass_type: 'premium',
      sector: 'retail',
      vip: 'true',
    });
    expect(ctx.platform).toBe('web');
  });

  it('enterMiniService emits an enter event and tags later events with mini_service', () => {
    am.enterMiniService('checkout', 'home');
    am.track('task_started', { task_id: 't-9' });

    const events = am.buildPayload(identity).events;
    expect(events[0]).toMatchObject({
      name: 'deepdots_mini_service_enter',
      params: { mini_service: 'checkout', entry_point_type: 'home' },
    });
    // el evento posterior hereda el mini_service activo
    expect(events[1]).toMatchObject({
      name: 'task_started',
      params: { mini_service: 'checkout', task_id: 't-9' },
    });
  });

  it('builds an envelope linked by user_id (separate from feedback)', () => {
    am.track('page_view', { screen: '/home' });
    const payload: AnalyticsEnvelope = am.buildPayload(identity);

    expect(payload.publicKey).toBe('pk-1');
    expect(payload.userId).toBe('u-1');
    expect(payload.sessionId).toBe('s-1');
    expect(payload.events).toHaveLength(1);
  });

  it('flush sends via the sink and clears the buffer', () => {
    am.track('a');
    am.track('b');
    const payload = am.flush(identity);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(payload);
    expect(payload?.events.map((e) => e.name)).toEqual(['a', 'b']);
    expect(am.pending()).toBe(0);
  });

  it('flush is a no-op when there are no events (no empty sends)', () => {
    const payload = am.flush(identity);
    expect(payload).toBeNull();
    expect(sink).not.toHaveBeenCalled();
  });

  it('exitMiniService emits mini_service_exit with duration and stops tagging', () => {
    am.enterMiniService('checkout', 'home');
    now += 4000;
    am.exitMiniService();
    am.track('after_exit');

    const events = am.buildPayload(identity).events;
    const exit = events.find((e) => e.name === 'deepdots_mini_service_exit');
    expect(exit?.params).toMatchObject({ mini_service: 'checkout', duration_seconds: 4 });
    // tras salir, los eventos ya no se etiquetan con mini_service
    const after = events.find((e) => e.name === 'after_exit');
    expect(after?.params?.mini_service).toBeUndefined();
  });

  it('calls onFlushNeeded when events reach maxBatchSize', () => {
    const onFlushNeeded = vi.fn();
    const am2 = new AnalyticsManager({ sink, now: () => now, maxBatchSize: 3, onFlushNeeded });
    am2.track('e1'); am2.track('e2');
    expect(onFlushNeeded).not.toHaveBeenCalled();
    am2.track('e3');
    expect(onFlushNeeded).toHaveBeenCalledOnce();
  });

  it('exitMiniService is a no-op when no mini-service is active', () => {
    am.exitMiniService();
    expect(am.pending()).toBe(0);
  });
});
