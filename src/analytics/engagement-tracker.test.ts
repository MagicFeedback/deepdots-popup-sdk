import { describe, it, expect } from 'vitest';
import { EngagementTracker } from './engagement-tracker';

describe('EngagementTracker', () => {
  const make = () => {
    let clock = 0;
    const t = new EngagementTracker(() => clock);
    return { t, advance: (ms: number) => (clock += ms) };
  };

  it('accumulates active time while resumed and consume() resets', () => {
    const { t, advance } = make();
    t.resume();
    advance(3000);
    expect(t.consume()).toBe(3000);
    // tras consumir, el contador se reinicia pero el timer sigue corriendo
    advance(1000);
    expect(t.consume()).toBe(1000);
  });

  it('does not accrue time while paused', () => {
    const { t, advance } = make();
    t.resume();
    advance(2000);
    t.pause();
    advance(5000); // en pausa: no cuenta
    expect(t.consume()).toBe(2000);
  });

  it('resume after pause continues accumulating', () => {
    const { t, advance } = make();
    t.resume();
    advance(1000);
    t.pause();
    advance(9000);
    t.resume();
    advance(500);
    expect(t.consume()).toBe(1500);
  });

  it('consume returns 0 when never resumed', () => {
    const { t } = make();
    expect(t.consume()).toBe(0);
  });
});
