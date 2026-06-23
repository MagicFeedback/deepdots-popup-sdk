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
  };
  events: AnalyticsEvent[];
}

export type AnalyticsSink = (payload: AnalyticsEnvelope) => void;

/** Identidad resuelta por el tracking, inyectada al construir el payload. */
export interface AnalyticsIdentity {
  userId: string | null;
  sessionId: string | null;
}

/** Sink por defecto: NO envía nada, solo pinta por consola lo que se enviaría. */
export const dryRunSink: AnalyticsSink = (payload) => {
  // eslint-disable-next-line no-console
  console.log(
    '[DeepdotsAnalytics] (dry-run · NO enviado · sin init.analytics) POST /sdk/feedback →',
    JSON.stringify(payload, null, 2),
  );
};

export interface AnalyticsManagerOptions {
  sink?: AnalyticsSink;
  now?: () => number;
  publicKey?: string;
  language?: string;
  device?: DeviceInfo;
  /** Plataforma del envelope (default 'web'; RN inyecta 'android'/'ios'). */
  platform?: string;
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
  private miniService: string | null = null;
  private miniServiceEnteredAt = 0;

  constructor(options: AnalyticsManagerOptions = {}) {
    this.sink = options.sink ?? dryRunSink;
    this.now = options.now ?? (() => Date.now());
    this.publicKey = options.publicKey;
    this.language = options.language;
    this.device = options.device;
    this.platform = options.platform ?? 'web';
  }

  /** Mezcla user attributes (se coercionan a string). Mutable en runtime. */
  setUserAttributes(attrs: Record<string, string | number | boolean>): void {
    for (const [k, v] of Object.entries(attrs)) {
      if (!k) continue;
      this.attributes[k] = String(v);
    }
  }

  /** Marca el inicio de un mini-service; etiqueta los eventos siguientes con `mini_service`. */
  enterMiniService(name: string, entryPointType?: string): void {
    this.miniService = name;
    this.miniServiceEnteredAt = this.now();
    this.track('mini_service_enter', { entry_point_type: entryPointType ?? null });
  }

  /** Cierra el mini-service activo emitiendo `mini_service_exit` con su duración (#27). No-op si no hay ninguno. */
  exitMiniService(): void {
    const name = this.miniService;
    if (name == null) return;
    const durationSeconds = Math.max(0, Math.round((this.now() - this.miniServiceEnteredAt) / 1000));
    this.miniService = null; // dejar de etiquetar antes de emitir el evento de salida
    this.track('mini_service_exit', { mini_service: name, duration_seconds: durationSeconds });
  }

  /** Registra un evento de analítica (modelo GA: nombre + params). */
  track(name: string, params?: Record<string, unknown>): void {
    const merged: Record<string, unknown> = {
      ...(this.miniService ? { mini_service: this.miniService } : {}),
      ...(params ?? {}),
    };
    this.events.push({
      name,
      timestamp: this.now(),
      params: Object.keys(merged).length ? merged : undefined,
    });
  }

  /** Mini-service activo (para inyectarlo en la metadata del survey, #33). */
  getMiniService(): string | null {
    return this.miniService;
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
      },
      events: [...this.events],
    };
  }

  /** Envía (vía sink) el lote acumulado y vacía el buffer. No-op si no hay eventos. */
  flush(identity: AnalyticsIdentity): AnalyticsEnvelope | null {
    if (this.events.length === 0) return null;
    const payload = this.buildPayload(identity);
    this.sink(payload);
    this.events = [];
    return payload;
  }
}
