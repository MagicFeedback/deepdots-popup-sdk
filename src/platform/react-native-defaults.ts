/**
 * Registro de la plataforma React Native, compartido por las dos entradas que lo hacen
 * (`index.native.ts` y el Provider de `/react-native`). Recibe los módulos de `react-native`
 * para que este fichero no lo importe (el core también se compila para web).
 */
import type { AppStateLike } from '../react-native/setup';
import {
  createHermesRejectionHub,
  getReactNativePlatform,
  registerReactNativePlatform,
  type HermesRejectionTrackerLike,
  type NativeBackgroundTaskModule,
  type PromiseRejectionHub,
} from './react-native-platform';

export interface ReactNativeModules {
  AppState: AppStateLike;
  NativeModules?: { DeepdotsBackgroundTask?: NativeBackgroundTaskModule | null } | null;
  Platform: { OS: string };
}

declare const __DEV__: boolean | undefined;

let hub: PromiseRejectionHub | null | undefined;

export function registerReactNativeDefaults(rn: ReactNativeModules): void {
  // Una sola envoltura del tracker de Hermes aunque las dos entradas se carguen.
  if (hub === undefined) {
    hub = getReactNativePlatform()?.promiseRejections
      ?? createHermesRejectionHub(
        (globalThis as { HermesInternal?: HermesRejectionTrackerLike }).HermesInternal,
        { dev: typeof __DEV__ !== 'undefined' && !!__DEV__ },
      );
  }
  registerReactNativePlatform({
    os: rn.Platform.OS,
    appState: rn.AppState,
    backgroundTaskModule: rn.NativeModules?.DeepdotsBackgroundTask ?? null,
    promiseRejections: hub,
  });
}
