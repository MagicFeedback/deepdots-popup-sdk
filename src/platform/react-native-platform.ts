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
  // Se llama al importar el paquete: nada de aquí puede lanzar (un throw en la carga del bundle
  // es fatal en Release). Ante cualquier sorpresa, sin hub: el SDK no captura rejections.
  let original: (options?: RejectionTrackingOptions) => void;
  try {
    if (!hermes || typeof hermes.enablePromiseRejectionTracker !== 'function') return null;
    original = hermes.enablePromiseRejectionTracker.bind(hermes);
  } catch {
    return null;
  }
  const listeners = new Set<(error: unknown) => void>();
  let hostOptions: RejectionTrackingOptions | null = null;
  let active = false;

  const forwardsToHost = (error: unknown): boolean =>
    !!hostOptions?.onUnhandled
    && (hostOptions.allRejections === true
      || DEFAULT_REJECTION_WHITELIST.some((type) => error instanceof type));

  const apply = (): boolean => {
    try {
      install();
      return true;
    } catch {
      return false;
    }
  };

  const install = () => {
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

  const wrapper = (next?: RejectionTrackingOptions) => {
    hostOptions = next ?? null;
    if (active) install();
    else original(next);
  };

  // Hermes reciente (RN 0.88 / Expo 58) deja la propiedad de solo lectura. Sin poder envolverla
  // no se compone con el tracker del host, y activar el nuestro le quitaría las rejections a
  // Sentry/Crashlytics: mejor no capturarlas.
  if (!replaceTracker(hermes, wrapper)) return null;

  return {
    addUnhandledListener(listener) {
      listeners.add(listener);
      if (!active) {
        active = apply();
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const TRACKER_KEY = 'enablePromiseRejectionTracker';

/**
 * Sustituye `hermes.enablePromiseRejectionTracker` sin lanzar nunca: asignación si es escribible,
 * `defineProperty` si es de solo lectura pero configurable, y si no (objeto congelado) nada.
 * Devuelve si la sustitución quedó puesta.
 */
function replaceTracker(
  hermes: HermesRejectionTrackerLike,
  wrapper: (options?: RejectionTrackingOptions) => void,
): boolean {
  try {
    const own = Object.getOwnPropertyDescriptor(hermes, TRACKER_KEY);
    if (own && own.writable === false && !own.set) {
      if (!own.configurable) return false;
      Object.defineProperty(hermes, TRACKER_KEY, { ...own, value: wrapper });
    } else {
      hermes.enablePromiseRejectionTracker = wrapper;
    }
    return hermes.enablePromiseRejectionTracker === wrapper;
  } catch {
    return false;
  }
}
