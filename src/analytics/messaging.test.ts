import { describe, it, expect } from 'vitest';
import { buildMessageParams, MessageGuard, MAX_TRACKED_MESSAGES } from './messaging';

describe('buildMessageParams', () => {
  it('maps stage + core fields; omits absent optionals', () => {
    const p = buildMessageParams('delivered', { id: 'msg-42', title: 'Rebajas', channel: 'push' });
    expect(p).toEqual({ stage: 'delivered', message_id: 'msg-42', message_title: 'Rebajas', channel: 'push' });
  });

  it('includes campaign/value/currency and merges extra params', () => {
    const p = buildMessageParams('converted', {
      id: 'm1', title: 'Verano', channel: 'in_app', campaign: 'summer', value: 49.9, currency: 'EUR',
      params: { placement: 'home' },
    });
    expect(p).toMatchObject({
      stage: 'converted', message_id: 'm1', message_title: 'Verano', channel: 'in_app',
      campaign: 'summer', value: 49.9, currency: 'EUR', placement: 'home',
    });
  });

  it('keeps value:0 (does not drop a falsy numeric)', () => {
    const p = buildMessageParams('converted', { id: 'm', title: 't', channel: 'push', value: 0 });
    expect(p.value).toBe(0);
  });
});

describe('MessageGuard', () => {
  const msg = (id: string, channel = 'push') => ({ id, title: 't', channel: channel as 'push' });

  it('acepta el funnel completo de un mensaje en un solo canal', () => {
    const g = new MessageGuard();
    expect(g.evaluate('delivered', msg('m1')).emit).toBe(true);
    expect(g.evaluate('clicked', msg('m1')).emit).toBe(true);
    expect(g.evaluate('converted', msg('m1')).emit).toBe(true);
  });

  // Protección 1: channel fuera de la whitelist → descarta.
  it('descarta un channel desconocido', () => {
    const g = new MessageGuard();
    const v = g.evaluate('delivered', msg('m1', 'PUSH'));
    expect(v).toMatchObject({ emit: false, reason: 'invalid_channel' });
    expect(v.emit === false && v.detail).toContain('PUSH');
  });

  it('un channel inválido no registra estado (el siguiente evento válido pasa)', () => {
    const g = new MessageGuard();
    g.evaluate('delivered', msg('m1', 'email'));
    expect(g.evaluate('delivered', msg('m1', 'push')).emit).toBe(true);
  });

  // Protección 2: idempotencia por (message_id, stage).
  it('emite un stage repetido del mismo mensaje una sola vez', () => {
    const g = new MessageGuard();
    expect(g.evaluate('clicked', msg('m1')).emit).toBe(true);
    const v = g.evaluate('clicked', msg('m1'));
    expect(v).toMatchObject({ emit: false, reason: 'duplicate_stage' });
    expect(v.emit === false && v.detail).toContain('m1');
  });

  it('la idempotencia es por mensaje: el mismo stage de otro message_id pasa', () => {
    const g = new MessageGuard();
    g.evaluate('clicked', msg('m1'));
    expect(g.evaluate('clicked', msg('m2')).emit).toBe(true);
  });

  // Protección 3: un message_id no puede cambiar de canal.
  it('descarta un segundo channel para un message_id ya visto', () => {
    const g = new MessageGuard();
    expect(g.evaluate('delivered', msg('m1', 'push')).emit).toBe(true);
    const v = g.evaluate('clicked', msg('m1', 'in_app'));
    expect(v).toMatchObject({ emit: false, reason: 'channel_conflict' });
    expect(v.emit === false && v.detail).toContain('in_app');
  });

  it('un conflicto de channel no consume el stage: el mismo stage en el canal correcto pasa', () => {
    const g = new MessageGuard();
    g.evaluate('delivered', msg('m1', 'push'));
    g.evaluate('clicked', msg('m1', 'in_app')); // rechazado
    expect(g.evaluate('clicked', msg('m1', 'push')).emit).toBe(true);
  });

  it('el conflicto tiene prioridad sobre la idempotencia (razón más precisa)', () => {
    const g = new MessageGuard();
    g.evaluate('clicked', msg('m1', 'push'));
    expect(g.evaluate('clicked', msg('m1', 'in_app'))).toMatchObject({ reason: 'channel_conflict' });
  });

  it('acota la memoria: evicta los message_id más antiguos pasado el techo', () => {
    const g = new MessageGuard();
    for (let i = 0; i < MAX_TRACKED_MESSAGES + 1; i++) g.evaluate('clicked', msg(`m${i}`));
    // m0 fue evictado → su duplicado ya no se detecta (trade-off aceptado del techo)
    expect(g.evaluate('clicked', msg('m0')).emit).toBe(true);
    // el más reciente sigue vigilado
    expect(g.evaluate('clicked', msg(`m${MAX_TRACKED_MESSAGES}`)).emit).toBe(false);
  });
});
