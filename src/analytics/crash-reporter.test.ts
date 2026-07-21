import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrashReporter, crashRecordToParams, type CrashRecord } from './crash-reporter';
import { InMemoryStorage } from '../tracking/tracking-manager';

function make(overrides: Partial<{ enabled: boolean }> = {}) {
  const emit = vi.fn();
  const storage = new InMemoryStorage();
  const reporter = new CrashReporter({
    storage,
    emit,
    device: () => ({ appVersion: '1.0.0', osVersion: '17.4', deviceModel: 'iPhone14,3' }),
    sessionId: () => 'sess-1',
    now: () => 1_000,
    enabled: () => overrides.enabled ?? true,
  });
  return { reporter, emit, storage };
}

describe('CrashReporter.reportError', () => {
  it('emits a deepdots_app_crash payload immediately with crash-time context', () => {
    const { reporter, emit } = make();
    reporter.reportError(new TypeError('boom'), { severity: 'error', context: { screen: 'Checkout', order_id: 'o-42' } });

    expect(emit).toHaveBeenCalledTimes(1);
    const params = emit.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      crashed_at: 1000,
      crash_type: 'TypeError',
      message: 'boom',
      fatal: false,
      handled: true,
      severity: 'error',
      crashed_session_id: 'sess-1',
      crashed_app_version: '1.0.0',
      crashed_os_version: '17.4',
      crashed_device_model: 'iPhone14,3',
      ctx_screen: 'Checkout',
      ctx_order_id: 'o-42',
    });
    expect(typeof params.stack).toBe('string');
  });

  it('defaults severity=error/handled=true and marks fatal only when severity=fatal', () => {
    const { reporter, emit } = make();
    reporter.reportError(new Error('a'));
    reporter.reportError(new Error('b'), { severity: 'fatal' });
    expect((emit.mock.calls[0][0] as any).severity).toBe('error');
    expect((emit.mock.calls[0][0] as any).fatal).toBe(false);
    expect((emit.mock.calls[1][0] as any).severity).toBe('fatal');
    expect((emit.mock.calls[1][0] as any).fatal).toBe(true);
  });

  it('accepts a string error and is a no-op when disabled', () => {
    const { reporter, emit } = make({ enabled: false });
    reporter.reportError('plain string');
    expect(emit).not.toHaveBeenCalled();
  });

  it('crashRecordToParams omits undefined optional fields', () => {
    const rec: CrashRecord = {
      crashedAt: 5, crashType: 'Error', message: 'm', stack: '', fatal: true,
      handled: false, severity: 'fatal', sessionId: null,
    };
    const params = crashRecordToParams(rec);
    expect(params).not.toHaveProperty('crashed_session_id');
    expect(params).not.toHaveProperty('crashed_app_version');
    expect(params).toMatchObject({ crashed_at: 5, crash_type: 'Error', fatal: true, handled: false, severity: 'fatal' });
  });
});

describe('CrashReporter disk queue', () => {
  it('persist() appends records; drainPendingCrashes() returns and clears them', () => {
    const emit = vi.fn();
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit,
      device: () => ({ appVersion: '1.0.0' }),
      sessionId: () => 'sess-1',
      now: () => 2_000,
      enabled: () => true,
    });

    // simula dos crashes no capturados persistidos
    reporter._persistForTest(new Error('first'));
    reporter._persistForTest(new Error('second'));

    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(2);
    expect(drained[0].message).toBe('first');
    expect(drained[0].fatal).toBe(true);
    expect(drained[0].handled).toBe(false);
    expect(drained[0].severity).toBe('fatal');
    // segunda lectura ya está vacía
    expect(reporter.drainPendingCrashes()).toEqual([]);
  });

  it('caps the queue at 20 records, dropping the oldest', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => true,
    });
    for (let i = 0; i < 25; i++) reporter._persistForTest(new Error(`e${i}`));
    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(20);
    expect(drained[0].message).toBe('e5'); // los 5 más viejos se descartaron
    expect(drained[19].message).toBe('e24');
  });

  it('drainPendingCrashes tolerates corrupt storage (returns empty)', () => {
    const storage = new InMemoryStorage();
    storage.setItem('deepdots.crash.queue', 'not json');
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => true,
    });
    expect(reporter.drainPendingCrashes()).toEqual([]);
  });
});

describe('CrashReporter.install (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op in React Native where window exists but addEventListener is not a function', () => {
    // RN define un `window` global, pero SIN addEventListener. El guard debe
    // detectarlo por capacidad (no solo por existencia de `window`).
    vi.stubGlobal('window', {});
    const { reporter } = make();
    expect(() => reporter.install()).not.toThrow();
  });

  it('registers error/unhandledrejection listeners when addEventListener exists', () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener });
    const { reporter } = make();
    reporter.install();
    expect(addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });
});

describe('CrashReporter.installReactNative', () => {
  function makeErrorUtils() {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    return {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => { handler = h; },
      fire: (error: unknown, isFatal?: boolean) => handler?.(error, isFatal),
    };
  }

  it('hooks ErrorUtils: a thrown error is persisted and the previous handler is chained', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({ appVersion: '1.0.0' }),
      sessionId: () => 'sess-1',
      now: () => 7_000,
      enabled: () => true,
    });
    const eu = makeErrorUtils();
    const previous = vi.fn();
    eu.setGlobalHandler(previous);

    reporter.installReactNative(eu);
    eu.fire(new TypeError('rn boom'), true);

    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(1);
    expect(drained[0].crashType).toBe('TypeError');
    expect(drained[0].message).toBe('rn boom');
    expect(drained[0].fatal).toBe(true);
    expect(drained[0].handled).toBe(false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does not persist when disabled, but still chains to the previous handler', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => false,
    });
    const eu = makeErrorUtils();
    const previous = vi.fn();
    eu.setGlobalHandler(previous);

    reporter.installReactNative(eu);
    eu.fire(new Error('x'), false);

    expect(reporter.drainPendingCrashes()).toEqual([]);
    expect(previous).toHaveBeenCalledTimes(1);
  });
});
