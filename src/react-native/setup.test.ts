import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepdotsPopups } from '../core/deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { setupReactNative, mmkvStorage, collectRnDevice } from './setup';

// Fakes de los módulos nativos
function fakeMmkv() {
  const m = new Map<string, string>();
  return {
    getString: (k: string) => m.get(k),
    set: (k: string, v: string) => void m.set(k, v),
    delete: (k: string) => void m.delete(k),
    _map: m,
  };
}

const fakeDeviceInfo = {
  isTablet: () => false,
  getSystemVersion: () => '17.4',
  getDeviceId: () => 'iPhone15,2',
  getVersion: () => '3.1.0',
};

describe('mmkvStorage', () => {
  it('adapta MMKV a la interfaz KeyValueStorage', () => {
    const s = mmkvStorage(fakeMmkv());
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });
});

describe('collectRnDevice', () => {
  it('mapea react-native-device-info al DeviceInfo del SDK', () => {
    expect(collectRnDevice(fakeDeviceInfo)).toEqual({
      device_type: 'mobile',
      os_version: '17.4',
      device_model: 'iPhone15,2',
      app_version: '3.1.0',
    });
  });
});

describe('setupReactNative', () => {
  let sdk: DeepdotsPopups;
  beforeEach(() => {
    localStorage.clear();
    sdk = new DeepdotsPopups();
  });

  it('inyecta storage (MMKV), device y platform; persiste el user_id en MMKV', () => {
    const mmkv = fakeMmkv();
    setupReactNative(sdk, { apiKey: 'k' }, {
      mmkv,
      deviceInfo: fakeDeviceInfo,
      platform: 'ios',
      renderer: new NoopPopupRenderer(),
    });

    const uid = sdk.getUserId();
    expect(uid).toBeTruthy();
    expect(mmkv.getString('deepdots.user_id')).toBe(uid); // persistido en MMKV
    const ctx = sdk.previewAnalytics().context;
    expect(ctx.platform).toBe('ios');
    expect(ctx.device).toMatchObject({ os_version: '17.4', device_model: 'iPhone15,2', app_version: '3.1.0' });
  });

  it('conecta AppState a onForeground/onBackground y devuelve cleanup', () => {
    let handler: ((s: string) => void) | null = null;
    const remove = vi.fn();
    const appState = {
      addEventListener: (_t: 'change', cb: (s: string) => void) => {
        handler = cb;
        return { remove };
      },
    };
    const onFg = vi.spyOn(sdk, 'onForeground');
    const onBg = vi.spyOn(sdk, 'onBackground');

    const dispose = setupReactNative(sdk, { apiKey: 'k' }, {
      appState,
      renderer: new NoopPopupRenderer(),
    });

    handler!('active');
    handler!('background');
    expect(onFg).toHaveBeenCalledTimes(1);
    expect(onBg).toHaveBeenCalledTimes(1);

    // 'inactive' (iOS: llamada entrante, app switcher) NO cierra sesión: solo envía lo acumulado.
    const flush = vi.spyOn(sdk, 'flushAnalytics');
    handler!('inactive');
    expect(onBg).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);

    dispose();
    expect(remove).toHaveBeenCalled();
  });

  it('degrada sin módulos nativos (sin crashear)', () => {
    expect(() => setupReactNative(sdk, { apiKey: 'k' }, { renderer: new NoopPopupRenderer() })).not.toThrow();
    expect(sdk.getUserId()).toBeTruthy(); // funciona con storage por defecto
  });

  it('engancha global.ErrorUtils para capturar errores JS no manejados de RN', () => {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const errorUtils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => { handler = h; },
    };
    const spy = vi.spyOn(sdk, 'installReactNativeCrashHandler');

    setupReactNative(sdk, { apiKey: 'k' }, { errorUtils, renderer: new NoopPopupRenderer() });

    expect(spy).toHaveBeenCalledWith(errorUtils);
    expect(typeof handler).toBe('function');
  });
});
