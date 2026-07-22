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

  it('setMetric merges metrics into context.metrics (coerced to string), overwrites on repeat, ignores empty key', () => {
    am.setMetric('cart_value', 49.99);
    am.setMetric('items_in_cart', 3);
    am.setMetric('vip', true);
    am.setMetric('cart_value', 51.25); // misma key → sobrescribe
    am.setMetric('', 'x'); // key vacía → ignorada

    const ctx = am.buildPayload(identity).context;
    expect(ctx.metrics).toEqual({
      cart_value: '51.25',
      items_in_cart: '3',
      vip: 'true',
    });
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
    am.exitMiniService('checkout');
    am.track('after_exit');

    const events = am.buildPayload(identity).events;
    const exit = events.find((e) => e.name === 'deepdots_mini_service_exit');
    expect(exit?.params).toMatchObject({ mini_service: 'checkout', duration_seconds: 4 });
    // tras salir, los eventos ya no se etiquetan con mini_service
    const after = events.find((e) => e.name === 'after_exit');
    expect(after?.params?.mini_service).toBeUndefined();
  });

  it('soporta varios mini-services a la vez; exitMiniService(name) cierra el correcto', () => {
    am.enterMiniService('checkout', 'home');
    now += 1000;
    am.enterMiniService('support_chat', 'fab');
    // el "actual" para etiquetar es el más reciente
    expect(am.getMiniService()).toBe('support_chat');

    now += 2000;
    am.exitMiniService('checkout'); // cierra el de DENTRO, no el más reciente
    const exit = am.buildPayload(identity).events.find((e) => e.name === 'deepdots_mini_service_exit');
    expect(exit?.params).toMatchObject({ mini_service: 'checkout', duration_seconds: 3 });

    // support_chat sigue activo y sigue etiquetando
    expect(am.getMiniService()).toBe('support_chat');
    am.track('still_in_support');
    const ev = am.buildPayload(identity).events.find((e) => e.name === 'still_in_support');
    expect(ev?.params?.mini_service).toBe('support_chat');
  });

  it('exitAllMiniServices cierra todos los activos (LIFO)', () => {
    am.enterMiniService('a');
    am.enterMiniService('b');
    am.exitAllMiniServices();

    const exits = am.buildPayload(identity).events.filter((e) => e.name === 'deepdots_mini_service_exit');
    expect(exits.map((e) => e.params?.mini_service)).toEqual(['b', 'a']); // LIFO: el más reciente primero
    expect(am.getMiniService()).toBeNull();
  });

  it('calls onFlushNeeded when events reach maxBatchSize', () => {
    const onFlushNeeded = vi.fn();
    const am2 = new AnalyticsManager({ sink, now: () => now, maxBatchSize: 3, onFlushNeeded });
    am2.track('e1'); am2.track('e2');
    expect(onFlushNeeded).not.toHaveBeenCalled();
    am2.track('e3');
    expect(onFlushNeeded).toHaveBeenCalledOnce();
  });

  it('exitMiniService is a no-op when that mini-service is not active', () => {
    am.exitMiniService('nope');
    expect(am.pending()).toBe(0);
  });
});
