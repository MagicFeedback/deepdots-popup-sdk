/**
 * Lo que el SDK necesita de React Native para detectar solo el ciclo de vida y el tiempo de
 * background (DD-55, contrato de detección automática). El core no importa `react-native` (se
 * usa también en web): lo registra la entrada de React Native del paquete
 * (`src/index.native.ts`, que Metro elige por la condición `react-native`) y el Provider.
 */
import type { AppStateLike } from '../react-native/setup';
import type { BackgroundTaskRunner } from '../analytics/background-task';

/** Forma del módulo nativo `DeepdotsBackgroundTask` (ios/DeepdotsBackgroundTask.m). */
export interface NativeBackgroundTaskModule {
  begin(token: string, name: string): void;
  end(token: string): void;
}

export interface ReactNativePlatform {
  /** `Platform.OS`. */
  os: string;
  /** `AppState` de react-native. */
  appState?: AppStateLike | null;
  /** `NativeModules.DeepdotsBackgroundTask`, si el autolinking lo enlazó (iOS). */
  backgroundTaskModule?: NativeBackgroundTaskModule | null;
}

let registered: ReactNativePlatform | null = null;

/** Lo llama la entrada de React Native al cargarse. */
export function registerReactNativePlatform(platform: ReactNativePlatform): void {
  registered = platform;
}

export function getReactNativePlatform(): ReactNativePlatform | null {
  return registered;
}

/** Solo tests. */
export function resetReactNativePlatform(): void {
  registered = null;
}

/** Adaptador del módulo nativo al contrato `BackgroundTaskRunner`. */
export function nativeModuleTask(mod: NativeBackgroundTaskModule): BackgroundTaskRunner {
  let seq = 0;
  return (name) => {
    const token = `dd-${Date.now().toString(36)}-${(seq++).toString(36)}`;
    mod.begin(token, name);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      mod.end(token);
    };
  };
}

/**
 * La background task que usa el SDK: la del host si la pasa; si no, la del módulo nativo en iOS;
 * si no hay ninguna, nada (comportamiento anterior: el cierre se guarda y se reenvía al arrancar).
 */
export function resolveBackgroundTask(
  explicit: BackgroundTaskRunner | undefined,
  platform: ReactNativePlatform | null,
): BackgroundTaskRunner | undefined {
  if (explicit) return explicit;
  const mod = platform?.backgroundTaskModule;
  if (platform?.os === 'ios' && mod && typeof mod.begin === 'function' && typeof mod.end === 'function') {
    return nativeModuleTask(mod);
  }
  return undefined;
}
