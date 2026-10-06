/**
 * Observador de navegación (Fase 2). Detecta cambios de pantalla y emite "visitas"
 * completadas (screen + entrada/salida/duración) cuando se abandona una pantalla.
 *
 * En Web se engancha a la History API (pushState/replaceState/popstate/hashchange).
 * La lógica de timing y normalización es pura y testeable sin DOM (vía `begin`/`visit`/`stop`
 * y un reloj inyectable).
 *
 * El consumidor (DeepdotsPopups) reenvía cada visita como un evento `page_view` por el
 * canal de analytics; el grafo se reconstruye en backend por orden + timestamp.
 */

export interface ScreenVisit {
  /** Pantalla normalizada (IDs → `:id`): agrupa las visitas a la misma pantalla. */
  screen: string;
  /**
   * La ruta real, sin query: `/insights/requests/2f1c…` donde `screen` dice
   * `/insights/requests/:id`. Es lo que permite enlazar la visita al elemento concreto.
   */
  path: string;
  entry: number;
  exit: number;
  durationSeconds: number;
}

export type VisitListener = (visit: ScreenVisit) => void;

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** La ruta de una URL: path (+hash route), sin query. Sin normalizar los IDs. */
export function screenPath(href: string): string {
  let pathAndHash: string;
  try {
    const u = new URL(href, 'http://deepdots.local');
    pathAndHash = u.pathname + (u.hash || '');
  } catch {
    pathAndHash = href;
  }
  // quitar query (incluida la que pueda venir dentro del hash route)
  return pathAndHash.replace(/\?[^#]*/g, '') || '/';
}

/** Normaliza una URL a un nombre de pantalla: path (+hash route), sin query, IDs → :id. */
export function normalizeScreen(href: string): string {
  const pathAndHash = screenPath(href);
  const collapsed = pathAndHash
    .split('/')
    .map((seg) => (/^[0-9]+$/.test(seg) || UUID_PREFIX.test(seg) ? ':id' : seg))
    .join('/');
  return collapsed || '/';
}

export interface NavigationObserverOptions {
  now?: () => number;
}

export class NavigationObserver {
  private now: () => number;
  private listeners = new Set<VisitListener>();
  private currentScreen: string | null = null;
  private currentPath: string | null = null;
  private entryAt = 0;
  private installed = false;
  private domHandlers: Array<() => void> = [];

  constructor(options: NavigationObserverOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  onVisit(listener: VisitListener): void {
    this.listeners.add(listener);
  }

  /** Fija la pantalla inicial (sin emitir visita; su duración se cierra al salir). */
  begin(href: string): void {
    this.currentScreen = normalizeScreen(href);
    this.currentPath = screenPath(href);
    this.entryAt = this.now();
  }

  /** Navega a una pantalla nueva: cierra la anterior (emite visita) y abre la nueva. */
  visit(href: string): void {
    const nextPath = screenPath(href);
    // Misma ruta (solo cambia la query) → no es una visita nueva. Se compara la ruta y no
    // la pantalla normalizada: pasar de una research a otra (`/insights/requests/A` → `/B`)
    // sí es otra visita, aunque las dos sean `/insights/requests/:id`.
    if (this.currentScreen != null && nextPath === this.currentPath) return;
    this.closeCurrent();
    this.currentScreen = normalizeScreen(href);
    this.currentPath = nextPath;
    this.entryAt = this.now();
  }

  /** Cierra la pantalla actual emitiendo su visita (p. ej. al cerrar la app/pestaña). */
  stop(): void {
    this.closeCurrent();
    this.currentScreen = null;
    this.currentPath = null;
  }

  /**
   * Olvida la pantalla actual SIN emitir su visita. Para una sesión que el backend ya dio
   * por cerrada: su visita no tiene dónde ir, y mandarla con la sesión nueva la contaría
   * donde no ocurrió. Después, `restart()` vuelve a empezar en la pantalla actual.
   */
  discard(): void {
    this.currentScreen = null;
    this.currentPath = null;
  }

  /**
   * Retoma el seguimiento en la pantalla actual tras un `stop()`, cuando se abre una sesión
   * nueva sin navegar (cambio de usuario, vuelta de la bfcache). No-op si nunca se instaló
   * (navegación manual por `setScreen`, RN) o si ya hay pantalla en curso.
   */
  restart(): void {
    if (!this.installed || this.currentScreen != null || typeof window === 'undefined') return;
    this.begin(window.location.href);
  }

  private closeCurrent(): void {
    if (this.currentScreen == null) return;
    const exit = this.now();
    const visit: ScreenVisit = {
      screen: this.currentScreen,
      path: this.currentPath ?? this.currentScreen,
      entry: this.entryAt,
      exit,
      durationSeconds: Math.max(0, Math.round((exit - this.entryAt) / 1000)),
    };
    this.listeners.forEach((l) => {
      try {
        l(visit);
      } catch {
        /* listener no debe romper la navegación */
      }
    });
  }

  /** Instala los hooks de History en el navegador y registra la pantalla actual. */
  install(): void {
    if (this.installed || typeof window === 'undefined' || typeof history === 'undefined') return;
    this.installed = true;

    const handle = () => this.visit(window.location.href);

    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);
    history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      const r = originalPush(data as never, unused, url as never);
      handle();
      return r;
    };
    history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      const r = originalReplace(data as never, unused, url as never);
      handle();
      return r;
    };
    window.addEventListener('popstate', handle);
    window.addEventListener('hashchange', handle);

    this.domHandlers.push(() => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener('popstate', handle);
      window.removeEventListener('hashchange', handle);
    });

    this.begin(window.location.href);
  }

  uninstall(): void {
    this.domHandlers.forEach((off) => off());
    this.domHandlers = [];
    this.installed = false;
  }
}
