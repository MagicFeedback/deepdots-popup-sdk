/**
 * Mapeo del envelope de analytics → body de `POST /sdk/feedback`.
 *
 * La analítica se envía como un Feedback del modelo del Surveys SDK, agrupado por una
 * INTEGRACIÓN creada en la plataforma. Se manda en streaming con `completed:false` y
 * `finished:false` (nunca se "cierra"); el backend cose por `sessionId` + `user_id`.
 *
 * Encoding:
 *  - todo va en `feedback.metadata`: contexto (user_id, session_id, platform…) + eventos
 *  - cada entrada usa `value: string[]` (array de un elemento)
 *  - eventos: {key: nombre_evento, value: [JSON(timestamp + params)]}
 *  - identidad (user_id) → `profile` como `external-user-id`
 *  - `answers` vacío, `metrics` no se usa
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

export function buildAnalyticsFeedbackBody(
  envelope: AnalyticsEnvelope,
  keys: AnalyticsKeys,
  feedbackSessionId?: string,
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

  return {
    feedback: {
      text: '',
      answers: [],
      metadata,
      profile,
      finished: false,
    },
    publicKey: keys.publicKey,
    integration: keys.integration,
    completed: false,
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
  /** Callback invocado cuando el backend devuelve un nuevo sessionId (primer POST). */
  onSessionId?: (id: string) => void;
}

/**
 * Sink real: transforma el envelope y hace `POST {baseUrl}/sdk/feedback`.
 * Fire-and-forget (no bloquea el flush); errores solo se loguean.
 * Stateful: cachea el `sessionId` que devuelve el backend en la primera respuesta
 * y lo envía en los siguientes POSTs para que el backend agrupe todos los eventos
 * en un único registro de feedback.
 */
export function createFeedbackSink(options: FeedbackSinkOptions): AnalyticsSink {
  let feedbackSessionId: string | undefined;

  return (envelope: AnalyticsEnvelope) => {
    const body = buildAnalyticsFeedbackBody(envelope, options.keys, feedbackSessionId);
    const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      options.log?.('[DeepdotsAnalytics] no fetch disponible; payload no enviado', body);
      return;
    }
    options.log?.('[DeepdotsAnalytics] POST /sdk/feedback →', body);
    f(`${options.baseUrl}/sdk/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (res.ok) {
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
        }
      })
      .catch((err) => options.log?.('[DeepdotsAnalytics] error enviando feedback', err));
  };
}
