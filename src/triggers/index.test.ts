import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTrigger } from './index';
import type { DeepdotsPopups } from '../core/deepdots-popups';
import type { TriggerConfig } from '../types';

function createPopupsStub() {
  return {
    triggerSurvey: vi.fn(),
    debug: vi.fn(),
  } as unknown as DeepdotsPopups & { triggerSurvey: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
}

describe('time trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara tras el delay en ms cuando value es number', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'time', value: 1000, surveyId: 's-1' };

    setupTrigger(popups, trigger);
    vi.advanceTimersByTime(999);
    expect(popups.triggerSurvey).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(popups.triggerSurvey).toHaveBeenCalledWith('s-1', undefined);
  });

  it('acepta value como string numérico (viene así de la API)', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'time', value: '250', surveyId: 's-1' };

    setupTrigger(popups, trigger);
    vi.advanceTimersByTime(250);
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });

  it('value: 0 dispara inmediatamente (0 es un delay válido, no "sin valor")', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'time', value: 0, surveyId: 's-1' };

    setupTrigger(popups, trigger);
    vi.advanceTimersByTime(0);
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });

  it('sin value usa el default de 5000ms', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'time', surveyId: 's-1' };

    setupTrigger(popups, trigger);
    vi.advanceTimersByTime(4999);
    expect(popups.triggerSurvey).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });

  it('value string no numérico cae al default en vez de romper setTimeout', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'time', value: 'not-a-number', surveyId: 's-1' };

    setupTrigger(popups, trigger);
    vi.advanceTimersByTime(4999);
    expect(popups.triggerSurvey).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });
});

describe('scroll trigger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockScroll(scrollY: number, scrollHeight: number, innerHeight: number) {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(scrollY);
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(innerHeight);
  }

  it('dispara al alcanzar el threshold numérico', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'scroll', value: 50, surveyId: 's-1' };
    setupTrigger(popups, trigger);

    mockScroll(0, 1100, 100); // 0%
    window.dispatchEvent(new Event('scroll'));
    expect(popups.triggerSurvey).not.toHaveBeenCalled();

    mockScroll(500, 1100, 100); // 50%
    window.dispatchEvent(new Event('scroll'));
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });

  it('acepta threshold como string numérico', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'scroll', value: '50', surveyId: 's-1' };
    setupTrigger(popups, trigger);

    mockScroll(500, 1100, 100); // 50%
    window.dispatchEvent(new Event('scroll'));
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });

  it('threshold no numérico cae al default (50%) en vez de nunca disparar', () => {
    const popups = createPopupsStub();
    const trigger: TriggerConfig = { type: 'scroll', value: 'bogus', surveyId: 's-1' };
    setupTrigger(popups, trigger);

    mockScroll(500, 1100, 100); // 50%
    window.dispatchEvent(new Event('scroll'));
    expect(popups.triggerSurvey).toHaveBeenCalledTimes(1);
  });
});
