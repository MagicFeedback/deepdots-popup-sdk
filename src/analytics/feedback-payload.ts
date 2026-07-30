/**
 * Mapeo del envelope de analytics → body de `POST /sdk/feedback`.
 *
 * La analítica se envía como un Feedback del modelo del Surveys SDK, agrupado por una
 * INTEGRACIÓN creada en la plataforma. Se manda en streaming con `completed:false`; el
 * backend cose por `sessionId` + `user_id`. El ÚLTIMO lote de una sesión (cierre de página,
 * app a background, cambio de usuario) va con `completed:true`: cierra el registro y el
 * siguiente lote omite el `sessionId` viejo para que el backend abra uno nuevo.
 * `feedback.finished` se queda siempre en `false` (no es la señal de cierre acordada).
 *
 * Encoding:
 *  - todo va en `feedback.metadata`: contexto (user_id, session_id, platform…) + eventos
 *  - cada entrada usa `value: string[]` (array de un elemento)
 *  - eventos: {key: nombre_evento, value: [JSON(timestamp + params)]}
 *  - identidad (user_id) → `profile` como `external-user-id`
 *  - métricas del host (setMetric) → `feedback.metrics` (mismo shape que metadata, sin prefijo)
 *  - `answers` vacío
 *  - `text` vacío
 */

import type { AnalyticsEnvelope, AnalyticsSink } from './analytics-manager';

export interface AnalyticsKeys {
  publicKey: string;
  integration: string;
}

export interface FeedbackKV {
  key: string;
  value: string[];
}

export interface AnalyticsFeedbackBody {
  feedback: {
    text: string;
    answers: FeedbackKV[];
    metrics: FeedbackKV[];
    metadata: FeedbackKV[];
    profile: FeedbackKV[];
    finished: boolean;
  };
  publicKey: string;
  integration: string;
  completed: boolean;
  finished?: boolean;
  /** sessionId devuelto por el primer POST; permite que el backend agrupe todos los eventos en un solo registro. */
  sessionId?: string;
}

/** Inserta un par key/value en la lista solo si el valor está definido y no es vacío. */
function pushKV(list: FeedbackKV[], key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  list.push({ key, value: [String(value)] });
}

export interface BuildBodyOptions {
  /**
   * `true` en el último lote de la sesión → `completed:true` (cierra el registro en backend).
   * El body SÍ lleva el `sessionId` actual (es el registro que se cierra); es el lote
   * SIGUIENTE el que lo omite.
   */
  sessionEnd?: boolean;
}

export function buildAnalyticsFeedbackBody(
  envelope: AnalyticsEnvelope,
  keys: AnalyticsKeys,
  feedbackSessionId?: string,
  options?: BuildBodyOptions,
): AnalyticsFeedbackBody {
  const { context } = envelope;

  const profile: FeedbackKV[] = [];
  pushKV(profile, 'external-user-id', envelope.userId);

  // Todo va en metadata: contexto del sistema (prefijo deepdots_) + atributos de usuario + eventos
  const metadata: FeedbackKV[] = [];
  pushKV(metadata, 'deepdots_user_id', envelope.userId);
  pushKV(metadata, 'deepdots_session_id', envelope.sessionId);
  pushKV(metadata, 'deepdots_platform', context.platform);
  pushKV(metadata, 'deepdots_language', context.language);
  if (context.device) {
    const d = context.device;
    pushKV(metadata, 'deepdots_device_type', d.device_type);
    pushKV(metadata, 'deepdots_os_version', d.os_version);
    pushKV(metadata, 'deepdots_device_model', d.device_model);
    pushKV(metadata, 'deepdots_app_version', d.app_version);
    pushKV(metadata, 'deepdots_user_agent', d.user_agent);
    pushKV(metadata, 'deepdots_timezone', d.timezone);
    pushKV(metadata, 'deepdots_referrer', d.referrer);
    pushKV(metadata, 'deepdots_viewport_size', d.viewport_size);
    pushKV(metadata, 'deepdots_screen_resolution', d.screen_resolution);
    pushKV(metadata, 'deepdots_pixel_ratio', d.pixel_ratio);
    pushKV(metadata, 'deepdots_entry_type', d.entry_type);
    pushKV(metadata, 'deepdots_page_load_ms', d.page_load_ms);
    pushKV(metadata, 'deepdots_connection_type', d.connection_type);
    pushKV(metadata, 'deepdots_country', d.country);
    pushKV(metadata, 'deepdots_city', d.city);
  }
  for (const [k, v] of Object.entries(context.attributes ?? {})) {
    pushKV(metadata, k, v);
  }
  for (const e of envelope.events) {
    metadata.push({
      key: e.name,
      value: [JSON.stringify({ timestamp: e.timestamp, ...(e.params ?? {}) })],
    });
  }

  // Métricas del host → campo dedicado `feedback.metrics` (mismo shape que metadata, sin prefijo).
  const metrics: FeedbackKV[] = [];
  for (const [k, v] of Object.entries(context.metrics ?? {})) {
    pushKV(metrics, k, v);
  }

  return {
    feedback: {
      text: '',
      answers: [],
      metrics,
      metadata,
      profile,
      finished: false,
    },
    publicKey: keys.publicKey,
    integration: keys.integration,
    // Único marcador de cierre acordado con backend: el último lote de la sesión.
    completed: options?.sessionEnd === true,
    ...(feedbackSessionId ? { sessionId: feedbackSessionId } : {}),
  };
}

export interface FeedbackSinkOptions {
  /** Base URL del backend (api(.|-dev.)deepdots.com) ya resuelta por el entorno. */
  baseUrl: string;
  keys: AnalyticsKeys;
  /** Logger opcional (gated por debug). */
  log?: (...args: unknown[]) => void;
  /** fetch inyectable (tests / RN). */
  fetchImpl?: typeof fetch;
  /**
   * `navigator.sendBeacon` inyectable. Solo se usa en el flush final (cierre de página):
   * sobrevive al unload, a cambio de no poder leer la respuesta. Si no se pasa, el flush
   * final usa `fetch` con `keepalive`.
   */
  sendBeaconImpl?: (url: string, body: Blob | string) => boolean;
  /** Callback invocado cuando el backend devuelve un nuevo sessionId (primer POST). */
  onSessionId?: (id: string) => void;
  /** Callback invocado al cerrar la sesión (`completed:true`): el sessionId cacheado se olvida. */
  onSessionReset?: () => void;
}

/** Límite práctico de `fetch({keepalive:true})` y de `sendBeacon` (~64KB en Chrome). */
const KEEPALIVE_MAX_BYTES = 60_000;

/** Un fallo transitorio merece reintento; un 4xx (payload/claves/Contact) no. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

async function safeBodyText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Sink real: transforma el envelope y hace `POST {baseUrl}/sdk/feedback`.
 *
 * Stateful: cachea el `sessionId` que devuelve el backend en la primera respuesta y lo
 * envía en los siguientes POSTs para que el backend agrupe todos los eventos en un único
 * registro de feedback.
 *
 * Garantías de entrega:
 *  - mientras no se conozca el `sessionId`, los lotes se **serializan** (esperan la primera
 *    respuesta): dos POSTs a la vez sin `sessionId` crearían dos registros y partirían los datos;
 *  - `keepalive` para que el navegador no cancele el POST al navegar fuera, y `sendBeacon`
 *    en el flush final (cierre de página), donde `fetch` puede morir con el documento;
 *  - la promesa **rechaza** en fallo transitorio (red, 5xx, 408, 429) para que el
 *    `AnalyticsManager` re-encole el lote; un 4xx se loguea y se descarta.
 */
export function createFeedbackSink(options: FeedbackSinkOptions): AnalyticsSink {
  let feedbackSessionId: string | undefined;
  /** Primer POST (aún sin sessionId) en vuelo: los siguientes lotes lo esperan. */
  let firstPostInFlight: Promise<void> | null = null;

  const url = `${options.baseUrl}/sdk/feedback`;

  const post = async (body: AnalyticsFeedbackBody, final: boolean, sessionEnd = false): Promise<void> => {
    const json = JSON.stringify(body);
    const small = json.length <= KEEPALIVE_MAX_BYTES;

    // Cierre de página: sendBeacon sobrevive al unload (a cambio, no hay respuesta que leer).
    if (final && options.sendBeaconImpl && small) {
      const payload = typeof Blob !== 'undefined' ? new Blob([json], { type: 'application/json' }) : json;
      if (options.sendBeaconImpl(url, payload)) {
        options.log?.('[DeepdotsAnalytics] flush final vía sendBeacon');
        return;
      }
      options.log?.('[DeepdotsAnalytics] sendBeacon rechazó el lote; fallback a fetch');
    }

    const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      options.log?.('[DeepdotsAnalytics] no fetch disponible; payload no enviado', body);
      return;
    }

    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      // keepalive: el POST sobrevive a la navegación mientras el body sea pequeño.
      ...(small ? { keepalive: true } : {}),
    });

    if (!res.ok) {
      const detail = await safeBodyText(res);
      if (isRetryableStatus(res.status)) {
        // Rechazar → el manager re-encola el lote y se reintenta en el siguiente flush.
        throw new Error(`POST /sdk/feedback ${res.status} (reintentable): ${detail}`);
      }
      options.log?.(
        `[DeepdotsAnalytics] POST /sdk/feedback rechazado con ${res.status}; lote DESCARTADO:`,
        detail,
      );
      return;
    }

    // El POST de cierre devuelve el sessionId del registro que acabamos de cerrar:
    // NO se re-cachea (si no, el lote siguiente volvería a apuntar al registro cerrado).
    if (sessionEnd) return;

    try {
      const data = (await res.json()) as { sessionId?: string };
      if (data?.sessionId && data.sessionId !== feedbackSessionId) {
        feedbackSessionId = data.sessionId;
        options.log?.('[DeepdotsAnalytics] feedbackSessionId cacheado:', feedbackSessionId);
        options.onSessionId?.(feedbackSessionId);
      }
    } catch {
      /* respuesta sin JSON — ignorar */
    }
  };

  return async (envelope: AnalyticsEnvelope, meta) => {
    const final = meta?.final === true;
    const sessionEnd = meta?.sessionEnd === true;

    // Sin sessionId todavía: esperar al primer POST para heredarlo y no partir el registro.
    // En el flush final no se espera (la página se está muriendo): mejor un registro
    // partido que perder el lote — el backend cose por user_id.
    if (!feedbackSessionId && firstPostInFlight && !final) {
      await firstPostInFlight;
    }

    const body = buildAnalyticsFeedbackBody(envelope, options.keys, feedbackSessionId, { sessionEnd });
    options.log?.('[DeepdotsAnalytics] POST /sdk/feedback →', body);

    const sent = post(body, final, sessionEnd);
    if (sessionEnd) {
      // Registro cerrado con `completed:true`: olvidar el sessionId para que el siguiente
      // lote lo OMITA y el backend abra uno nuevo (sesión nueva, o usuario nuevo).
      feedbackSessionId = undefined;
      firstPostInFlight = null;
      options.onSessionReset?.();
    } else if (!feedbackSessionId) {
      // nunca rechaza: es solo una barrera de orden, el fallo lo propaga `sent`
      firstPostInFlight = sent.then(
        () => undefined,
        () => undefined,
      );
    }
    await sent;
  };
}
