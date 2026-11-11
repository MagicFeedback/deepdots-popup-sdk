import { describe, expect, it, vi } from 'vitest';
import { createHermesRejectionHub, type RejectionTrackingOptions } from './react-native-platform';

function fakeHermes() {
  let options: RejectionTrackingOptions | undefined;
  return {
    enablePromiseRejectionTracker: vi.fn((o?: RejectionTrackingOptions) => { options = o; }),
    current: () => options,
    reject(id: number, error: unknown) { options?.onUnhandled?.(id, error); },
    handled(id: number) { options?.onHandled?.(id, undefined); },
  };
}

describe('createHermesRejectionHub', () => {
  it('sin listeners es transparente: lo que instale el host va tal cual a Hermes', () => {
    const hermes = fakeHermes();
    const original = hermes.enablePromiseRejectionTracker;
    createHermesRejectionHub(hermes, { dev: false });
    const host = { allRejections: false, onUnhandled: vi.fn() };
    hermes.enablePromiseRejectionTracker(host);
    expect(original).toHaveBeenCalledWith(host);
  });

  it('con listener: todas las rejections, y encadena al tracker que el host instale después', () => {
    const hermes = fakeHermes();
    const hub = createHermesRejectionHub(hermes, { dev: false })!;
    const ours = vi.fn();
    hub.addUnhandledListener(ours);
    expect(hermes.current()?.allRejections).toBe(true);

    const onUnhandled = vi.fn();
    const onHandled = vi.fn();
    hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled, onHandled });
    hermes.reject(1, new Error('a'));
    hermes.handled(1);
    expect(ours).toHaveBeenCalledTimes(1);
    expect(onUnhandled).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onHandled).toHaveBeenCalledTimes(1);
  });

  it('respeta allRejections:false del host (solo ReferenceError/TypeError/RangeError le llegan)', () => {
    const hermes = fakeHermes();
    const hub = createHermesRejectionHub(hermes, { dev: false })!;
    const ours = vi.fn();
    hub.addUnhandledListener(ours);
    const host = vi.fn();
    hermes.enablePromiseRejectionTracker({ allRejections: false, onUnhandled: host });
    hermes.reject(1, new Error('plain'));
    hermes.reject(2, new TypeError('type'));
    expect(ours).toHaveBeenCalledTimes(2);
    expect(host).toHaveBeenCalledTimes(1);
  });

  it('en desarrollo, sin tracker del host, mantiene el aviso de React Native', () => {
    const hermes = fakeHermes();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = createHermesRejectionHub(hermes, { dev: true })!;
    hub.addUnhandledListener(() => {});
    hermes.reject(3, new Error('dev'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Possible unhandled promise rejection');
    warn.mockRestore();
  });

  it('un listener que lanza no corta la cadena; quitar el listener deja de avisarle', () => {
    const hermes = fakeHermes();
    const hub = createHermesRejectionHub(hermes, { dev: false })!;
    const remove = hub.addUnhandledListener(() => { throw new Error('bad listener'); });
    const host = vi.fn();
    hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: host });
    expect(() => hermes.reject(1, new Error('x'))).not.toThrow();
    expect(host).toHaveBeenCalledTimes(1);
    remove();
    const other = vi.fn();
    hub.addUnhandledListener(other);
    hermes.reject(2, new Error('y'));
    expect(other).toHaveBeenCalledTimes(1);
  });
});
