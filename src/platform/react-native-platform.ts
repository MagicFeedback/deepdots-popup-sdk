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
  /** Promesas rechazadas sin `catch` (Hermes). Null sin Hermes: no se capturan, como antes. */
  promiseRejections?: PromiseRejectionHub | null;
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

/** Opciones de `HermesInternal.enablePromiseRejectionTracker` (las mismas que `promise/rejection-tracking`). */
export interface RejectionTrackingOptions {
  allRejections?: boolean;
  onUnhandled?: (id: number, error: unknown) => void;
  onHandled?: (id: number, error?: unknown) => void;
}

/** Lo que el SDK necesita de `global.HermesInternal`. */
export interface HermesRejectionTrackerLike {
  enablePromiseRejectionTracker?: (options?: RejectionTrackingOptions) => void;
}

export interface PromiseRejectionHub {
  /** Avisa de cada promesa rechazada sin `catch`. Devuelve la función que lo quita. */
  addUnhandledListener(listener: (error: unknown) => void): () => void;
}

/** Lo que `promise/rejection-tracking` reporta con `allRejections: false`. */
const DEFAULT_REJECTION_WHITELIST = [ReferenceError, TypeError, RangeError];

/**
 * Promesas rechazadas sin `catch` en React Native (contrato de detección automática, paso 2).
 *
 * Hermes solo admite UN tracker (`enablePromiseRejectionTracker` sustituye al anterior) y no deja
 * leer el que hay. Para no quitarle las rejections a Sentry/Crashlytics, la entrada de React
 * Native envuelve la función al importarse el paquete, que es antes de que el código de la app
 * llame a `Sentry.init()` (los imports se evalúan primero): lo que instale después cualquiera se
 * compone con lo nuestro en vez de sustituirlo. Antes del import solo lo pudo instalar React
 * Native, y solo en desarrollo (el aviso "Possible unhandled promise rejection"), que se mantiene
 * con `dev`. Mientras el SDK no se engancha, la función envuelta pasa todo tal cual a Hermes.
 *
 * Devuelve null sin Hermes o sin el tracker (JSC): el SDK sigue sin capturarlas, como antes.
 */
export function createHermesRejectionHub(
  hermes: HermesRejectionTrackerLike | null | undefined,
  options: { dev: boolean },
): PromiseRejectionHub | null {
  if (!hermes || typeof hermes.enablePromiseRejectionTracker !== 'function') return null;
  const original = hermes.enablePromiseRejectionTracker.bind(hermes);
  const listeners = new Set<(error: unknown) => void>();
  let hostOptions: RejectionTrackingOptions | null = null;
  let active = false;

  const forwardsToHost = (error: unknown): boolean =>
    !!hostOptions?.onUnhandled
    && (hostOptions.allRejections === true
      || DEFAULT_REJECTION_WHITELIST.some((type) => error instanceof type));

  const apply = () => {
    original({
      allRejections: true,
      onUnhandled: (id, error) => {
        listeners.forEach((listener) => {
          try {
            listener(error);
          } catch {
            /* un fallo nuestro no le quita el error al host */
          }
        });
        if (hostOptions?.onUnhandled) {
          if (forwardsToHost(error)) hostOptions.onUnhandled(id, error);
        } else if (options.dev) {
          console.warn(`Possible unhandled promise rejection (id: ${id}):`, error);
        }
      },
      onHandled: (id, error) => hostOptions?.onHandled?.(id, error),
    });
  };

  hermes.enablePromiseRejectionTracker = (next?: RejectionTrackingOptions) => {
    hostOptions = next ?? null;
    if (active) apply();
    else original(next);
  };

  return {
    addUnhandledListener(listener) {
      listeners.add(listener);
      if (!active) {
        active = true;
        apply();
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
