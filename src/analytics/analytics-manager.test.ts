import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AnalyticsManager, type AnalyticsEnvelope, type AnalyticsSink } from './analytics-manager';

/** Deja correr las microtasks pendientes (el re-encolado ocurre al rechazar el sink). */
const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * Analytics = canal SEPARADO del feedback (send()). Eventos GA-style enviados a un
 * endpoint propio, vinculados por user_id. Aquí el "envío" es un sink inyectable; en
 * producción será un POST. El sink por defecto hace console.log (dry-run).
 */
describe('AnalyticsManager', () => {
  let now: number;
  let sink: Mock<AnalyticsSink>;
  let am: AnalyticsManager;

  beforeEach(() => {
    now = 1_000;
    sink = vi.fn<AnalyticsSink>();
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

  it('propaga sessionEnd al sink para que cierre el registro con completed:true', () => {
    am.track('e1');
    am.flush(identity, { sessionEnd: true });
    expect(sink).toHaveBeenCalledWith(expect.anything(), { sessionEnd: true });
  });

  it('resetUserScope olvida attributes y metrics del usuario anterior', () => {
    am.setUserAttributes({ pass_type: 'premium' });
    am.setMetric('cart_value', 10);
    am.resetUserScope();

    const ctx = am.buildPayload(identity).context;
    expect(ctx.attributes).toEqual({});
    expect(ctx.metrics).toEqual({});
  });

  it('exitMiniService is a no-op when that mini-service is not active', () => {
    am.exitMiniService('nope');
    expect(am.pending()).toBe(0);
  });

  /**
   * Entrega: un fallo de envío no puede hacer desaparecer los eventos. El buffer se vacía
   * al enviar, pero si el sink falla el lote vuelve para reintentarse en el siguiente flush.
   */
  describe('re-encolado en fallo de envío', () => {
    it('devuelve el lote al buffer cuando el sink rechaza y lo reenvía en el flush siguiente', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('network down'));
      const am2 = new AnalyticsManager({ sink: failing, now: () => now });
      am2.track('e1');
      am2.track('e2');

      expect(am2.flush(identity)).not.toBeNull();
      expect(am2.pending()).toBe(0); // se vacía de forma optimista
      await settle(); // el rechazo se procesa fuera del flush

      expect(am2.pending()).toBe(2); // ...y vuelve al re-encolar
      failing.mockResolvedValue(undefined);
      am2.track('e3');
      const payload = am2.flush(identity) as AnalyticsEnvelope;
      // orden cronológico: los reintentados delante de los nuevos
      expect(payload.events.map((e) => e.name)).toEqual(['e1', 'e2', 'e3']);
      await settle();
      expect(am2.pending()).toBe(0);
    });

    it('no re-encola cuando el sink resuelve, ni cuando es síncrono', async () => {
      const ok = vi.fn().mockResolvedValue(undefined);
      const am2 = new AnalyticsManager({ sink: ok, now: () => now });
      am2.track('e1');
      am2.flush(identity);
      await settle();
      expect(am2.pending()).toBe(0);

      const syncSink = vi.fn(); // sink legacy, sin promesa
      const am3 = new AnalyticsManager({ sink: syncSink, now: () => now });
      am3.track('e1');
      am3.flush(identity);
      await settle();
      expect(am3.pending()).toBe(0);
    });

    it('re-encola también si el sink lanza de forma síncrona', () => {
      const throwing = vi.fn(() => {
        throw new Error('boom');
      });
      const am2 = new AnalyticsManager({ sink: throwing, now: () => now });
      am2.track('e1');
      am2.flush(identity);
      expect(am2.pending()).toBe(1);
    });

    it('descarta los eventos más antiguos al superar maxBufferedEvents', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('down'));
      const am2 = new AnalyticsManager({ sink: failing, now: () => now, maxBufferedEvents: 3 });
      am2.track('e1');
      am2.track('e2');
      am2.track('e3');
      am2.flush(identity);
      await settle();

      am2.track('e4'); // el buffer ya está lleno con el lote re-encolado
      expect(am2.pending()).toBe(3);
      const payload = am2.buildPayload(identity);
      expect(payload.events.map((e) => e.name)).toEqual(['e2', 'e3', 'e4']); // e1 (el más viejo) fuera
    });
  });

  it('propaga meta.final al sink (cierre de página → transporte que sobrevive al unload)', () => {
    am.track('e1');
    am.flush(identity, { final: true });
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1' }), { final: true });
  });
});
