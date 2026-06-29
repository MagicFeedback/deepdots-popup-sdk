import { describe, it, expect, vi } from 'vitest';
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
