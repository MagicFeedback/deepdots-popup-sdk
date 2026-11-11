import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import {
  createHermesRejectionHub,
  registerReactNativePlatform,
  resetReactNativePlatform,
  type RejectionTrackingOptions,
} from '../platform/react-native-platform';
import type { DeepdotsInitParams } from '../types';

/**
 * React Native: promesas rechazadas sin `catch` (Hermes) recogidas sin código del host, como
 * ya pasaba con los errores de `ErrorUtils`. Activo por defecto, `autoTrack.errors = false` lo
 * apaga, un tracker del host (Sentry, Crashlytics) sigue recibiéndolo, y sin Hermes nada cambia.
 * Sacado del paso 2 del contrato de detección automática (#82), que sigue aparcado.
 */

async function initRn(extra: Partial<DeepdotsInitParams> = {}) {
  mockPopupsApi([]);
  const sdk = new DeepdotsPopups();
  sdk.setRenderer(new NoopPopupRenderer());
  sdk.init({ apiKey: 'k', storage: new InMemoryStorage(), ...extra });
  await flushPopupsLoad();
  return sdk;
}

function fakeHermes() {
  let options: RejectionTrackingOptions | undefined;
  let seq = 0;
  return {
    enablePromiseRejectionTracker: vi.fn((o?: RejectionTrackingOptions) => {
      options = o;
    }),
    reject(error: unknown) {
      options?.onUnhandled?.(seq++, error);
    },
  };
}
const queued = (storage: InMemoryStorage) =>
  JSON.parse(storage.getItem('deepdots.crash.queue') ?? '[]');

describe('React Native: promesas rechazadas sin catch (Hermes)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    resetReactNativePlatform();
    vi.unstubAllGlobals();
  });

  it('por defecto: una promesa rechazada sin catch queda registrada como crash', async () => {
    const hermes = fakeHermes();
    registerReactNativePlatform({ os: 'ios', promiseRejections: createHermesRejectionHub(hermes, { dev: false }) });
    const storage = new InMemoryStorage();
    await initRn({ storage });
    hermes.reject(new TypeError('no catch'));
    const q = queued(storage);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ crashType: 'TypeError', message: 'no catch', handled: false });
  });

  it('autoTrack.errors = false: no engancha el tracker', async () => {
    const hermes = fakeHermes();
    const enable = hermes.enablePromiseRejectionTracker;
    registerReactNativePlatform({ os: 'ios', promiseRejections: createHermesRejectionHub(hermes, { dev: false }) });
    const storage = new InMemoryStorage();
    await initRn({ storage, autoTrack: { errors: false } });
    expect(enable).not.toHaveBeenCalled();
    hermes.reject(new Error('x'));
    expect(queued(storage)).toHaveLength(0);
  });

  it('un tracker que instala el host después (p. ej. Sentry) sigue recibiéndolo y no se duplica', async () => {
    const hermes = fakeHermes();
    registerReactNativePlatform({ os: 'ios', promiseRejections: createHermesRejectionHub(hermes, { dev: false }) });
    const storage = new InMemoryStorage();
    const sdk = await initRn({ storage });
    const sentry = vi.fn();
    hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: sentry });
    sdk.setTrackingEnabled(false);
    sdk.setTrackingEnabled(true); // re-engancha handlers: no debe duplicar
    hermes.reject(new Error('boom'));
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(queued(storage)).toHaveLength(1);
  });

  it('sin Hermes (o sin el tracker) no rompe nada', async () => {
    expect(createHermesRejectionHub(undefined, { dev: false })).toBeNull();
    expect(createHermesRejectionHub({}, { dev: false })).toBeNull();
    registerReactNativePlatform({ os: 'android', promiseRejections: null });
    await expect(initRn()).resolves.toBeDefined();
  });
});
