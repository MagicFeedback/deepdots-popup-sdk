import { describe, it, expect } from 'vitest';
import { buildMessageParams } from './messaging';

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
