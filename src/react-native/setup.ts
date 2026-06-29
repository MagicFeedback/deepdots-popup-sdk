/**
 * Auto-wiring de React Native: concentra TODA la configuración en el SDK para que el
 * host solo tenga que envolver su app en un `<DeepdotsProvider config={...}>`.
 *
 * No importa React ni librerías nativas: el host (o el Provider) le pasa los módulos
 * nativos que tenga instalados (MMKV, device-info, AppState). Todo es opcional y degrada
 * con elegancia (sin MMKV → in-memory; sin device-info → sin device info).
 */
import type { DeepdotsPopups } from '../core/deepdots-popups';
import type { DeepdotsInitParams } from '../types';
import type { KeyValueStorage } from '../tracking/tracking-manager';
import type { DeviceInfo } from '../analytics/device-info';
import type { PopupRenderer } from '../platform/renderer';
import type { ReactNativeErrorUtils } from '../analytics/crash-reporter';

/** Forma mínima de `react-native-mmkv` (instancia MMKV). */
export interface MmkvLike {
  getString(key: string): string | undefined | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** Forma mínima de `react-native-device-info`. */
export interface DeviceInfoLike {
  isTablet?: () => boolean;
  getSystemVersion?: () => string;
  getDeviceId?: () => string;
  getVersion?: () => string;
}

/** Forma mínima de `AppState` de react-native. */
export interface AppStateLike {
  addEventListener(type: 'change', listener: (state: string) => void): { remove: () => void } | void;
}

export interface ReactNativeSetupDeps {
  mmkv?: MmkvLike | null;
  deviceInfo?: DeviceInfoLike | null;
  appState?: AppStateLike | null;
  platform?: 'web' | 'android' | 'ios';
  renderer?: PopupRenderer;
  /** `global.ErrorUtils` de RN (para capturar errores JS no manejados). Default: `globalThis.ErrorUtils`. */
  errorUtils?: ReactNativeErrorUtils | null;
}

/** Adaptador KeyValueStorage (síncrono) sobre una instancia de MMKV. */
export function mmkvStorage(mmkv: MmkvLike): KeyValueStorage {
  return {
    getItem: (k) => mmkv.getString(k) ?? null,
    setItem: (k, v) => mmkv.set(k, v),
    removeItem: (k) => mmkv.delete(k),
  };
}

/** Recoge device info desde react-native-device-info (Technology #11–13). */
export function collectRnDevice(d: DeviceInfoLike): DeviceInfo {
  return {
    device_type: d.isTablet?.() ? 'tablet' : 'mobile',
    os_version: d.getSystemVersion?.(),
    device_model: d.getDeviceId?.(),
    app_version: d.getVersion?.(),
  };
}

/**
 * Configura el SDK para React Native en una sola llamada: storage persistente (MMKV),
 * device info, platform, init y lifecycle (AppState → onForeground/onBackground).
 * Devuelve una función de limpieza (quita el listener de AppState).
 */
export function setupReactNative(
  sdk: DeepdotsPopups,
  config: DeepdotsInitParams,
  deps: ReactNativeSetupDeps = {},
): () => void {
  if (deps.renderer) sdk.setRenderer(deps.renderer);

  const storage = deps.mmkv ? mmkvStorage(deps.mmkv) : config.storage;
  const device = deps.deviceInfo ? collectRnDevice(deps.deviceInfo) : config.device;
  const platform = deps.platform ?? config.platform;

  sdk.init({ ...config, storage, device, platform });

  // Captura de errores JS no manejados en RN (no hay `window`): usa el ErrorUtils inyectado
  // o el global del runtime RN. Degrada si no existe.
  const errorUtils =
    deps.errorUtils ?? (globalThis as { ErrorUtils?: ReactNativeErrorUtils }).ErrorUtils;
  if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
    sdk.installReactNativeCrashHandler(errorUtils);
  }

  let subscription: { remove: () => void } | void;
  if (deps.appState?.addEventListener) {
    subscription = deps.appState.addEventListener('change', (state) => {
      if (state === 'active') sdk.onForeground();
      else sdk.onBackground(); // 'background' | 'inactive'
    });
  }

  return () => {
    if (subscription && typeof subscription.remove === 'function') subscription.remove();
  };
}
