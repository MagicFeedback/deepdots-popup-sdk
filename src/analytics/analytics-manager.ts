/**
 * Capa de Analytics (eventos GA-style) — canal SEPARADO del feedback de survey.
 *
 * El feedback de survey se envía con `magicfeedback.send()`. La analítica de
 * navegación/comportamiento (page views, mini-services, tasks/funnels, meaningful
 * interactions, findability…) va por un ENDPOINT PROPIO, vinculada por `user_id`.
 *
 * De momento NO se hace la llamada: el `sink` por defecto hace `console.log` del
 * payload exacto que se enviaría (dry-run), para poder verificarlo. Cuando el
 * endpoint exista, se sustituye el sink por un POST.
 */

import type { DeviceInfo } from './device-info';

export interface AnalyticsEvent {
  name: string;
  timestamp: number;
  params?: Record<string, unknown>;
}

export interface AnalyticsEnvelope {
  /** Clave pública del cliente (auth). */
  publicKey?: string;
  /** Id que vincula la analítica al usuario (el backend cose por aquí). */
  userId: string | null;
  /** Session id del backend si ya se conoce (puede ir null). */
  sessionId: string | null;
  context: {
    platform: string; // 'web' | 'android' | 'ios' (RN inyecta la suya)
    language?: string;
    /** Info de dispositivo (Technology #11–13). */
    device?: DeviceInfo;
    /** User attributes del cliente, usados para breakdowns (registration_status, pass_type, …). */
    attributes: Record<string, string>;
    /** Métricas del host: valores medibles persistentes → van en `feedback.metrics` del body. */
    metrics?: Record<string, string>;
  };
  events: AnalyticsEvent[];
}

/** Contexto del flush, para que el sink pueda adaptar el transporte. */
export interface AnalyticsFlushMeta {
  /**
   * `true` cuando el flush ocurre porque la página/app se está cerrando. El sink debe usar
   * un transporte que sobreviva al unload (sendBeacon) y no puede esperar respuestas.
   */
  final?: boolean;
  /**
   * `true` cuando este es el ÚLTIMO lote de la sesión (cierre de página, app a background,
   * cambio de usuario, tracking desactivado). El sink lo envía con `completed:true` y olvida
   * el `sessionId`, para que el lote siguiente abra un registro nuevo.
   */
  sessionEnd?: boolean;
}

/**
 * Envío del lote. Si devuelve una promesa que **rechaza**, el manager re-encola los
 * eventos para reintentarlos en el siguiente flush (fallo transitorio: red o 5xx).
 * Resolver = lote entregado o descartado definitivamente (no se reintenta).
 */
export type AnalyticsSink = (payload: AnalyticsEnvelope, meta?: AnalyticsFlushMeta) => void | Promise<void>;

/** Identidad resuelta por el tracking, inyectada al construir el payload. */
export interface AnalyticsIdentity {
  userId: string | null;
  sessionId: string | null;
}

/**
 * Sink de dry-run: NO envía nada, solo vuelca lo que se enviaría por el `log` dado
 * (default `console.log`, o el logger inyectado por el host en init()).
 */
export function createDryRunSink(log: (...args: unknown[]) => void = console.log): AnalyticsSink {
  return (payload) =>
    log(
      '[DeepdotsAnalytics] (dry-run · NO enviado · sin init.analytics) POST /sdk/feedback →',
      JSON.stringify(payload, null, 2),
    );
}

/** Sink por defecto: NO envía nada, solo pinta por consola lo que se enviaría. */
export const dryRunSink: AnalyticsSink = createDryRunSink();

export interface AnalyticsManagerOptions {
  sink?: AnalyticsSink;
  now?: () => number;
  publicKey?: string;
  language?: string;
  device?: DeviceInfo;
  /** Plataforma del envelope (default 'web'; RN inyecta 'android'/'ios'). */
  platform?: string;
  /** Nº máximo de eventos en buffer antes de solicitar un flush automático (default 20). */
  maxBatchSize?: number;
  /**
   * Techo de eventos retenidos en memoria contando los re-encolados por fallo de envío
   * (default 200). Al superarlo se descartan los más antiguos.
   */
  maxBufferedEvents?: number;
  /** Callback invocado cuando el buffer alcanza `maxBatchSize`. El caller hace el flush real. */
  onFlushNeeded?: () => void;
}

export class AnalyticsManager {
  private sink: AnalyticsSink;
  private now: () => number;
  private publicKey?: string;
  private language?: string;
  private device?: DeviceInfo;
  private platform: string;

  private events: AnalyticsEvent[] = [];
  private attributes: Record<string, string> = {};
  /** Métricas del host (valores medibles persistentes). Sobrescriben por key; se reenvían en cada flush. */
  private metrics: Record<string, string> = {};
  /** Mini-services activos: nombre → timestamp de entrada. El orden de inserción marca el "más reciente". */
  private activeMiniServices = new Map<string, number>();
  private maxBatchSize: number;
  private maxBufferedEvents: number;
  private onFlushNeeded?: () => void;

  constructor(options: AnalyticsManagerOptions = {}) {
    this.sink = options.sink ?? dryRunSink;
    this.now = options.now ?? (() => Date.now());
    this.publicKey = options.publicKey;
    this.language = options.language;
    this.device = options.device;
    this.platform = options.platform ?? 'web';
    this.maxBatchSize = options.maxBatchSize ?? 20;
    this.maxBufferedEvents = options.maxBufferedEvents ?? 200;
    this.onFlushNeeded = options.onFlushNeeded;
  }

  /** Actualiza campos de device en runtime (p.ej. country/city tras resolver geo). */
  updateDevice(partial: Partial<DeviceInfo>): void {
    this.device = { ...this.device, ...partial } as DeviceInfo;
  }

  /** Mezcla user attributes (se coercionan a string). Mutable en runtime. */
  setUserAttributes(attrs: Record<string, string | number | boolean>): void {
    for (const [k, v] of Object.entries(attrs)) {
      if (!k) continue;
      this.attributes[k] = String(v);
    }
  }

  /**
   * Registra/actualiza una métrica (valor medible). Persistente: se reenvía en cada flush.
   * Repetir la misma key SOBRESCRIBE; el valor se coerciona a string; ignora key vacía.
   */
  setMetric(key: string, value: string | number | boolean): void {
    if (!key) return;
    this.metrics[key] = String(value);
  }

  /**
   * Marca el inicio de un mini-service; etiqueta los eventos siguientes con `mini_service`.
   * Admite varios activos a la vez (concurrencia); el "actual" para etiquetar es el más reciente.
   * Reentrar con un nombre ya activo refresca su orden y su tiempo de entrada.
   */
  enterMiniService(name: string, entryPointType?: string): void {
    this.activeMiniServices.delete(name); // reinsertar = pasa a ser el más reciente
    this.activeMiniServices.set(name, this.now());
    this.track('deepdots_mini_service_enter', { entry_point_type: entryPointType ?? null });
  }

  /**
   * Cierra el mini-service `name` emitiendo `mini_service_exit` con su duración (#27).
   * No-op si ese nombre no está activo. Cierre coherente con concurrencia.
   */
  exitMiniService(name: string): void {
    const enteredAt = this.activeMiniServices.get(name);
    if (enteredAt === undefined) return;
    const durationSeconds = Math.max(0, Math.round((this.now() - enteredAt) / 1000));
    this.activeMiniServices.delete(name); // dejar de etiquetar con este antes de emitir
    this.track('deepdots_mini_service_exit', { mini_service: name, duration_seconds: durationSeconds });
  }

  /** Cierra TODOS los mini-services activos (orden LIFO). Para el cierre por lifecycle (background/cierre). */
  exitAllMiniServices(): void {
    for (const name of Array.from(this.activeMiniServices.keys()).reverse()) {
      this.exitMiniService(name);
    }
  }

  /**
   * Olvida lo que pertenecía al usuario anterior (user attributes + métricas) al cambiar de
   * usuario. NO toca el buffer de eventos: el cierre de sesión ya lo vació con la identidad
   * vieja, y lo que llegue después es del usuario nuevo.
   */
  resetUserScope(): void {
    this.attributes = {};
    this.metrics = {};
  }

  /** Registra un evento de analítica (modelo GA: nombre + params). */
  track(name: string, params?: Record<string, unknown>): void {
    const current = this.getMiniService();
    const merged: Record<string, unknown> = {
      ...(current ? { mini_service: current } : {}),
      ...(params ?? {}),
    };
    this.events.push({
      name,
      timestamp: this.now(),
      params: Object.keys(merged).length ? merged : undefined,
    });
    this.enforceBufferCap();
    if (this.events.length >= this.maxBatchSize) {
      this.onFlushNeeded?.();
    }
  }

  /** Mini-service actual (el más reciente aún activo) para etiquetar eventos + metadata del survey (#33). */
  getMiniService(): string | null {
    let last: string | null = null;
    for (const name of this.activeMiniServices.keys()) last = name; // última clave = más reciente
    return last;
  }

  /** Nº de eventos pendientes de flush. */
  pending(): number {
    return this.events.length;
  }

  /** Construye el envelope que se enviaría al endpoint de analytics. */
  buildPayload(identity: AnalyticsIdentity): AnalyticsEnvelope {
    return {
      publicKey: this.publicKey,
      userId: identity.userId,
      sessionId: identity.sessionId,
      context: {
        platform: this.platform,
        language: this.language,
        device: this.device,
        attributes: { ...this.attributes },
        metrics: { ...this.metrics },
      },
      events: [...this.events],
    };
  }

  /**
   * Envía (vía sink) el lote acumulado y vacía el buffer. No-op si no hay eventos.
   *
   * Si el sink falla de forma transitoria (promesa rechazada o excepción síncrona) el lote
   * se **re-encola** al principio del buffer y se reintenta en el siguiente flush: un error
   * de red o un 5xx no debe hacer desaparecer los eventos.
   */
  flush(identity: AnalyticsIdentity, meta?: AnalyticsFlushMeta): AnalyticsEnvelope | null {
    if (this.events.length === 0) return null;
    const batch = this.events;
    const payload = this.buildPayload(identity);
    this.events = [];

    let result: void | Promise<void>;
    try {
      // sin meta se invoca con un solo argumento (compatibilidad con sinks del host)
      result = meta ? this.sink(payload, meta) : this.sink(payload);
    } catch {
      this.requeue(batch);
      return payload;
    }
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).catch(() => this.requeue(batch));
    }
    return payload;
  }

  /**
   * Devuelve un lote fallido al buffer, delante de lo que haya llegado mientras se enviaba
   * (orden cronológico). Con el buffer lleno se descartan los eventos más antiguos.
   */
  private requeue(batch: AnalyticsEvent[]): void {
    this.events = [...batch, ...this.events];
    this.enforceBufferCap();
  }

  /** Techo del buffer: si el envío lleva rato fallando, se sacrifica lo más antiguo. */
  private enforceBufferCap(): void {
    const overflow = this.events.length - this.maxBufferedEvents;
    if (overflow > 0) this.events.splice(0, overflow);
  }
}
