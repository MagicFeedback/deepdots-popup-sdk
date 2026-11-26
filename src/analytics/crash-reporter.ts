/**
 * Crash & error reporting (Stability #14–17) — captura de errores GESTIONADOS.
 *
 * - `reportError()`: API pública para el host (app viva) → emite `deepdots_app_crash` ya.
 * - handlers de `window` (errores no capturados): persisten a disco y se reenvían
 *   en el siguiente arranque (el proceso puede morir antes del flush normal).
 *
 * El contexto de device/sesión se captura EN EL MOMENTO del crash y se guarda en el
 * record — no se lee del envelope en el replay (el replay puede ocurrir en otra
 * app_version/OS). Las dims OS/device en Web suelen ir vacías (se derivan del UA en backend).
 */

import type { KeyValueStorage } from '../tracking/tracking-manager';

export type CrashSeverity = 'fatal' | 'error' | 'warning';

export interface CrashRecord {
  crashedAt: number;
  crashType: string;
  message: string;
  stack: string;
  fatal: boolean;
  handled: boolean;
  severity: CrashSeverity;
  sessionId: string | null;
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  context?: Record<string, string>;
}

export interface ReportErrorOptions {
  severity?: CrashSeverity;
  handled?: boolean;
  context?: Record<string, unknown>;
}

export interface DeviceSnapshot {
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
}

/** Forma mínima de `global.ErrorUtils` de React Native. */
export interface ReactNativeErrorUtils {
  getGlobalHandler?(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/** Fuente de promesas rechazadas sin `catch` (en RN, el hub del tracker de Hermes). */
export interface UnhandledRejectionSource {
  addUnhandledListener(listener: (error: unknown) => void): () => void;
}

export interface CrashReporterOptions {
  storage: KeyValueStorage;
  /** Emite un evento deepdots_app_crash AHORA (app viva). */
  emit: (params: Record<string, unknown>) => void;
  /** Snapshot de device en el momento del crash. */
  device: () => DeviceSnapshot;
  /** session_id en el momento del crash. */
  sessionId: () => string | null;
  now?: () => number;
  /** Kill-switch de consentimiento. */
  enabled?: () => boolean;
}

const STACK_MAX = 8000;
const QUEUE_KEY = 'deepdots.crash.queue';
const MAX_QUEUED = 20;

/**
 * Avisos del navegador que no son fallos de la app (DD-540): no se reportan nunca.
 * Se comparan con `name`, `code` y `message` del error.
 */
export const BENIGN_ERROR_PATTERNS: readonly RegExp[] = [
  /ResizeObserver loop completed with undelivered notifications/i,
  /ResizeObserver loop limit exceeded/i,
];

/**
 * Fallos transitorios de red o de almacenamiento (DD-540): se reportan, pero como `warning`
 * no fatal, para que no cuenten en Crash-Free Users.
 */
export const NON_FATAL_ERROR_PATTERNS: readonly RegExp[] = [
  /auth\/network-request-failed/i,
  // IndexedDB cerrándose (pestaña en segundo plano, otra pestaña actualiza la versión, logout).
  /connection is closing/i,
];

/** Texto con el que se clasifica un error: `name`, `code` y `message` (o el valor tal cual). */
function errorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; code?: unknown; message?: unknown };
    return [e.name, e.code, e.message].filter((v) => typeof v === 'string').join(' ');
  }
  return String(error ?? '');
}

const matches = (text: string, patterns: readonly RegExp[]) => patterns.some((p) => p.test(text));

/** Aviso del navegador que no hay que reportar (p. ej. el bucle de ResizeObserver). */
export function isBenignError(error: unknown): boolean {
  return matches(errorText(error), BENIGN_ERROR_PATTERNS);
}

/** Ruido de red o almacenamiento que se reporta como `warning` no fatal. */
export function isNonFatalNoise(error: unknown): boolean {
  return matches(errorText(error), NON_FATAL_ERROR_PATTERNS);
}

/** Aplica las listas a un record ya guardado (cola de replay de una versión anterior). */
function reclassify(r: CrashRecord): CrashRecord | null {
  const text = `${r.crashType} ${r.message}`;
  if (matches(text, BENIGN_ERROR_PATTERNS)) return null;
  if (matches(text, NON_FATAL_ERROR_PATTERNS)) return { ...r, fatal: false, severity: 'warning' };
  return r;
}

/** Convierte un CrashRecord en los params del evento `deepdots_app_crash` (omite undefined). */
export function crashRecordToParams(r: CrashRecord): Record<string, unknown> {
  const params: Record<string, unknown> = {
    crashed_at: r.crashedAt,
    crash_type: r.crashType,
    message: r.message,
    stack: r.stack,
    fatal: r.fatal,
    handled: r.handled,
    severity: r.severity,
  };
  if (r.sessionId) params.crashed_session_id = r.sessionId;
  if (r.appVersion) params.crashed_app_version = r.appVersion;
  if (r.osVersion) params.crashed_os_version = r.osVersion;
  if (r.deviceModel) params.crashed_device_model = r.deviceModel;
  if (r.context) {
    for (const [k, v] of Object.entries(r.context)) params[`ctx_${k}`] = v;
  }
  return params;
}

export class CrashReporter {
  private options: CrashReporterOptions;
  private now: () => number;
  /** Los handlers de `window` ya están puestos: `install()` es idempotente. */
  private windowInstalled = false;
  /** ErrorUtils ya enganchados: engancharlos dos veces capturaría cada error dos veces. */
  private hookedErrorUtils = new Set<ReactNativeErrorUtils>();
  /** Fuentes de rejections ya enganchadas (idempotente, como ErrorUtils). */
  private hookedRejections = new Set<UnhandledRejectionSource>();

  constructor(options: CrashReporterOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
  }

  private isEnabled(): boolean {
    return this.options.enabled ? this.options.enabled() : true;
  }

  /** Construye un CrashRecord capturando contexto en el momento del crash. */
  private buildRecord(
    error: unknown,
    severity: CrashSeverity,
    handled: boolean,
    fatal: boolean,
    context?: Record<string, unknown>,
  ): CrashRecord {
    const err = error as { name?: string; message?: string; stack?: string };
    const isErr = error instanceof Error;
    const dev = this.options.device();
    const ctx = context
      ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)]))
      : undefined;
    return {
      crashedAt: this.now(),
      crashType: (isErr && err.name) || 'Error',
      message: isErr ? String(err.message ?? '') : String(error),
      stack: (isErr && typeof err.stack === 'string' ? err.stack : '').slice(0, STACK_MAX),
      fatal,
      handled,
      severity,
      sessionId: this.options.sessionId(),
      appVersion: dev.appVersion,
      osVersion: dev.osVersion,
      deviceModel: dev.deviceModel,
      context: ctx,
    };
  }

  /** API pública del host: reporta un error (app viva) → emite el evento ya. */
  reportError(error: unknown, options: ReportErrorOptions = {}): void {
    if (!this.isEnabled()) return;
    if (isBenignError(error)) return;
    const severity = isNonFatalNoise(error) ? 'warning' : (options.severity ?? 'error');
    const handled = options.handled ?? true;
    const fatal = severity === 'fatal';
    const record = this.buildRecord(error, severity, handled, fatal, options.context);
    this.options.emit(crashRecordToParams(record));
  }

  /** Captura un error no manejado (fatal) → persiste a disco para replay en el siguiente arranque. */
  captureUnhandled(error: unknown): void {
    if (isBenignError(error)) return;
    if (isNonFatalNoise(error)) {
      this.persist(this.buildRecord(error, 'warning', false, false));
      return;
    }
    this.persist(this.buildRecord(error, 'fatal', false, true));
  }

  /** Persiste un crash no capturado a disco para reenviarlo en el siguiente arranque. */
  private persist(record: CrashRecord): void {
    let queue: CrashRecord[] = [];
    try {
      const raw = this.options.storage.getItem(QUEUE_KEY);
      if (raw) queue = JSON.parse(raw) as CrashRecord[];
      if (!Array.isArray(queue)) queue = [];
    } catch {
      queue = [];
    }
    queue.push(record);
    if (queue.length > MAX_QUEUED) queue = queue.slice(queue.length - MAX_QUEUED);
    try {
      this.options.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      /* storage lleno / no disponible — se pierde el crash, no rompemos la app */
    }
  }

  /** Lee y vacía la cola de crashes pendientes (llamado en init para el replay). */
  drainPendingCrashes(): CrashRecord[] {
    let queue: CrashRecord[] = [];
    try {
      const raw = this.options.storage.getItem(QUEUE_KEY);
      if (raw) queue = JSON.parse(raw) as CrashRecord[];
      if (!Array.isArray(queue)) queue = [];
    } catch {
      queue = [];
    }
    if (queue.length) {
      try { this.options.storage.removeItem(QUEUE_KEY); } catch { /* noop */ }
    }
    // La cola puede venir de una versión sin las listas de DD-540.
    return queue.map(reclassify).filter((r): r is CrashRecord => r !== null);
  }

  /** Instala los handlers globales de errores no capturados (no-op sin `window`). Idempotente. */
  install(): void {
    if (this.windowInstalled) return;
    // En React Native `window` existe pero NO tiene addEventListener; comprobamos
    // la capacidad, no solo la existencia de `window`. En RN el host usa
    // installReactNative(ErrorUtils) para capturar los errores no manejados.
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this.windowInstalled = true;
    window.addEventListener('error', (e: ErrorEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.error ?? e.message ?? 'error');
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.reason ?? 'unhandledrejection');
    });
  }

  /** Engancha `global.ErrorUtils` de RN (no hay `window`): persiste y encadena al handler previo. Idempotente por instancia de ErrorUtils. */
  installReactNative(errorUtils: ReactNativeErrorUtils): void {
    if (this.hookedErrorUtils.has(errorUtils)) return;
    this.hookedErrorUtils.add(errorUtils);
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (this.isEnabled()) this.captureUnhandled(error);
      previous?.(error, isFatal);
    });
  }

  /**
   * Promesas rechazadas sin `catch` en React Native: como el `unhandledrejection` de web, se
   * persisten y se reenvían en el arranque siguiente. La fuente encadena al tracker del host.
   * Idempotente por fuente.
   */
  installPromiseRejections(source: UnhandledRejectionSource): void {
    if (this.hookedRejections.has(source)) return;
    this.hookedRejections.add(source);
    source.addUnhandledListener((error) => {
      if (this.isEnabled()) this.captureUnhandled(error ?? 'unhandledrejection');
    });
  }

  /** @internal Test seam: ejercita el camino de persistencia (window handlers no son testeables en vitest). */
  _persistForTest(error: unknown): void {
    this.captureUnhandled(error);
  }
}
