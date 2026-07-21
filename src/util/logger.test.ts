import { describe, it, expect, vi, afterEach } from 'vitest';
import { setLogger, sdkLog, sdkWarn, sdkError } from './logger';

afterEach(() => {
  setLogger(undefined); // reset al console por defecto
  vi.restoreAllMocks();
});

describe('module logger', () => {
  it('routes sdkLog/sdkWarn/sdkError to the injected logger', () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setLogger(logger);
    sdkLog('a');
    sdkWarn('b');
    sdkError('c');
    expect(logger.log).toHaveBeenCalledWith('a');
    expect(logger.warn).toHaveBeenCalledWith('b');
    expect(logger.error).toHaveBeenCalledWith('c');
  });

  it('falls back to log when warn/error are not provided', () => {
    const logger = { log: vi.fn() };
    setLogger(logger);
    sdkWarn('w');
    sdkError('e');
    expect(logger.log).toHaveBeenCalledWith('w');
    expect(logger.log).toHaveBeenCalledWith('e');
  });

  it('defaults to console.log when reset to undefined', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogger(undefined);
    sdkLog('x');
    expect(spy).toHaveBeenCalledWith('x');
  });
});
