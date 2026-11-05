import { describe, expect, it } from 'vitest';
import { scrollPercentFromEvent } from './scroll';

const ev = (y: number, content: number, layout: number) => ({
  nativeEvent: { contentOffset: { y }, contentSize: { height: content }, layoutMeasurement: { height: layout } },
});

describe('scrollPercentFromEvent', () => {
  it('calcula el % recorrido del contenido desplazable', () => {
    expect(scrollPercentFromEvent(ev(0, 1100, 100))).toBe(0);
    expect(scrollPercentFromEvent(ev(500, 1100, 100))).toBe(50);
    expect(scrollPercentFromEvent(ev(1000, 1100, 100))).toBe(100);
  });
  it('acota a 0–100 (rebote de iOS) y trata el contenido que cabe entero como 100%', () => {
    expect(scrollPercentFromEvent(ev(-40, 1100, 100))).toBe(0);
    expect(scrollPercentFromEvent(ev(1200, 1100, 100))).toBe(100);
    expect(scrollPercentFromEvent(ev(0, 80, 100))).toBe(100);
  });
  it('un evento sin las medidas devuelve null', () => {
    expect(scrollPercentFromEvent({} as never)).toBeNull();
    expect(scrollPercentFromEvent(null as never)).toBeNull();
  });
});
