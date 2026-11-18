import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RejectionTrackingOptions } from './react-native-platform';

/**
 * Importar el SDK en React Native nunca puede tumbar la app. Hermes reciente (RN 0.88, Expo 58)
 * deja `HermesInternal.enablePromiseRejectionTracker` de solo lectura: en 1.20.0/1.21.0 la
 * asignación lanzaba al cargar el bundle ("Cannot assign to read-only property", fatal en Release).
 */

const rn = {
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  NativeModules: {},
  Platform: { OS: 'ios' },
};

async function freshDefaults() {
  vi.resetModules();
  const defaults = await import('./react-native-defaults');
  const platform = await import('./react-native-platform');
  return { ...defaults, ...platform };
}

function trackerSpy() {
  let options: RejectionTrackingOptions | undefined;
  const fn = vi.fn((o?: RejectionTrackingOptions) => {
    options = o;
  });
  return { fn, current: () => options };
}

describe('registerReactNativeDefaults: HermesInternal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HermesInternal congelado (Hermes actual): no lanza, no toca Hermes y no hay hub', async () => {
    const tracker = trackerSpy();
    const hermes = Object.freeze({ enablePromiseRejectionTracker: tracker.fn });
    vi.stubGlobal('HermesInternal', hermes);
    const { registerReactNativeDefaults, getReactNativePlatform } = await freshDefaults();

    expect(() => registerReactNativeDefaults(rn)).not.toThrow();
    expect(hermes.enablePromiseRejectionTracker).toBe(tracker.fn);
    expect(tracker.fn).not.toHaveBeenCalled();
    expect(getReactNativePlatform()?.promiseRejections).toBeNull();
    expect(getReactNativePlatform()?.os).toBe('ios');
  });

  it('propiedad de solo lectura pero configurable: se envuelve con defineProperty', async () => {
    const tracker = trackerSpy();
    const hermes = {} as { enablePromiseRejectionTracker: (o?: RejectionTrackingOptions) => void };
    Object.defineProperty(hermes, 'enablePromiseRejectionTracker', {
      value: tracker.fn,
      writable: false,
      configurable: true,
    });
    vi.stubGlobal('HermesInternal', hermes);
    const { registerReactNativeDefaults, getReactNativePlatform } = await freshDefaults();

    expect(() => registerReactNativeDefaults(rn)).not.toThrow();
    expect(hermes.enablePromiseRejectionTracker).not.toBe(tracker.fn);
    expect(getReactNativePlatform()?.promiseRejections).not.toBeNull();
  });

  it('getter que lanza: no lanza y no hay hub', async () => {
    const hermes = {};
    Object.defineProperty(hermes, 'enablePromiseRejectionTracker', {
      get() {
        throw new Error('boom');
      },
    });
    vi.stubGlobal('HermesInternal', hermes);
    const { registerReactNativeDefaults, getReactNativePlatform } = await freshDefaults();

    expect(() => registerReactNativeDefaults(rn)).not.toThrow();
    expect(getReactNativePlatform()?.promiseRejections).toBeNull();
  });

  it('HermesInternal escribible: lo envuelve sin activar nada hasta init()', async () => {
    const tracker = trackerSpy();
    const hermes = { enablePromiseRejectionTracker: tracker.fn };
    vi.stubGlobal('HermesInternal', hermes);
    const { registerReactNativeDefaults, getReactNativePlatform } = await freshDefaults();

    registerReactNativeDefaults(rn);
    expect(hermes.enablePromiseRejectionTracker).not.toBe(tracker.fn);
    // Al importar no se instala ningún tracker: solo lo hará init() con autoTrack.errors.
    expect(tracker.fn).not.toHaveBeenCalled();
    const hub = getReactNativePlatform()?.promiseRejections;
    expect(hub).toBeTruthy();
    hub!.addUnhandledListener(() => {});
    expect(tracker.current()?.allRejections).toBe(true);
  });

  it('sin HermesInternal (JSC): no lanza y no hay hub', async () => {
    vi.stubGlobal('HermesInternal', undefined);
    const { registerReactNativeDefaults, getReactNativePlatform } = await freshDefaults();

    expect(() => registerReactNativeDefaults(rn)).not.toThrow();
    expect(getReactNativePlatform()?.promiseRejections).toBeNull();
  });
});
