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
    const severity = options.severity ?? 'error';
    const handled = options.handled ?? true;
    const fatal = severity === 'fatal';
    const record = this.buildRecord(error, severity, handled, fatal, options.context);
    this.options.emit(crashRecordToParams(record));
  }

  /** Captura un error no manejado (fatal) → persiste a disco para replay en el siguiente arranque. */
  captureUnhandled(error: unknown): void {
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
    return queue;
  }

  /** Instala los handlers globales de errores no capturados (no-op sin `window`). */
  install(): void {
    // En React Native `window` existe pero NO tiene addEventListener; comprobamos
    // la capacidad, no solo la existencia de `window`. En RN el host usa
    // installReactNative(ErrorUtils) para capturar los errores no manejados.
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('error', (e: ErrorEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.error ?? e.message ?? 'error');
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.reason ?? 'unhandledrejection');
    });
  }

  /** Engancha `global.ErrorUtils` de RN (no hay `window`): persiste y encadena al handler previo. */
  installReactNative(errorUtils: ReactNativeErrorUtils): void {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (this.isEnabled()) this.captureUnhandled(error);
      previous?.(error, isFatal);
    });
  }

  /** @internal Test seam: ejercita el camino de persistencia (window handlers no son testeables en vitest). */
  _persistForTest(error: unknown): void {
    this.captureUnhandled(error);
  }
}
