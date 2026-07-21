import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

/**
 * Logger inyectable (P1): el host puede pasar su propio objeto logger en init()
 * para volcar el output de debug del SDK a fichero/Firebase en vez de console.
 * Mismo gating que hoy: solo cuando debug=true. Default = console.
 */
describe('DeepdotsPopups — logger inyectable', () => {
  let popups: DeepdotsPopups;

  beforeEach(() => {
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });

  function makeLogger() {
    return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  }

  it('enruta los logs de debug al logger inyectado en vez de a console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = makeLogger();
    popups.init({ apiKey: 'k', debug: true, logger, storage: new InMemoryStorage() });

    const printed = logger.log.mock.calls.flat().map(String).join(' ');
    expect(printed).toContain('[DeepdotsPopups]');
    expect(printed).toContain('SDK initialized');
    // esos mensajes NO deben salir por console.log
    const consolePrinted = consoleSpy.mock.calls.flat().map(String).join(' ');
    expect(consolePrinted).not.toContain('[DeepdotsPopups]');
    consoleSpy.mockRestore();
  });

  it('no emite nada al logger cuando debug=false', () => {
    const logger = makeLogger();
    popups.init({ apiKey: 'k', debug: false, logger, storage: new InMemoryStorage() });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('cae a console.log por defecto cuando no se inyecta logger', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    popups.init({ apiKey: 'k', debug: true, storage: new InMemoryStorage() });
    const printed = consoleSpy.mock.calls.flat().map(String).join(' ');
    expect(printed).toContain('[DeepdotsPopups]');
    consoleSpy.mockRestore();
  });

  it('enruta el dry-run de analytics al logger inyectado', () => {
    const logger = makeLogger();
    popups.init({ apiKey: 'k', debug: true, logger, platform: 'android', storage: new InMemoryStorage() });
    popups.track('add_to_cart', { value: 1 });
    popups.flushAnalytics();
    const printed = logger.log.mock.calls.flat().map(String).join(' ');
    expect(printed).toContain('[DeepdotsAnalytics]');
    expect(printed).toContain('/sdk/feedback');
  });
});
