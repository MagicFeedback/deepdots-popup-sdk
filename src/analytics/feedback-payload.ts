/**
 * Mapeo del envelope de analytics → body de `POST /sdk/feedback`.
 *
 * La analítica se envía como un Feedback del modelo del Surveys SDK, agrupado por una
 * INTEGRACIÓN creada en la plataforma. Se manda en streaming con `completed:false` y
 * `finished:false` (nunca se "cierra"); el backend cose por `sessionId` + `user_id`.
 *
 * Encoding (decisión 2026-06-22):
 *  - cada evento (dato recabado) → una `metric` {key: nombre_evento, value: JSON(timestamp + params)}
 *  - identidad (user_id) → `profile` como `external-user-id`
 *  - contexto (user_id, session_id, platform, language, device, attributes) → `metadata`
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
  value: string;
}

export interface AnalyticsFeedbackBody {
  feedback: {
    text: string;
    answers?: FeedbackKV[];
    metadata: FeedbackKV[];
    metrics: FeedbackKV[];
    profile?: FeedbackKV[];
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
  list.push({ key, value: String(value) });
}

export function buildAnalyticsFeedbackBody(
  envelope: AnalyticsEnvelope,
  keys: AnalyticsKeys,
  feedbackSessionId?: string,
): AnalyticsFeedbackBody {
  const { context } = envelope;

  const metrics: FeedbackKV[] = envelope.events.map((e) => ({
    key: e.name,
    value: JSON.stringify({ timestamp: e.timestamp, ...(e.params ?? {}) }),
  }));

  const profile: FeedbackKV[] = [];
  pushKV(profile, 'external-user-id', envelope.userId);

  const metadata: FeedbackKV[] = [];
  pushKV(metadata, 'user_id', envelope.userId);
  pushKV(metadata, 'session_id', envelope.sessionId);
  pushKV(metadata, 'platform', context.platform);
  pushKV(metadata, 'language', context.language);
  if (context.device) {
    pushKV(metadata, 'device_type', context.device.device_type);
    pushKV(metadata, 'os_version', context.device.os_version);
    pushKV(metadata, 'device_model', context.device.device_model);
    pushKV(metadata, 'app_version', context.device.app_version);
    pushKV(metadata, 'user_agent', context.device.user_agent);
  }
  for (const [k, v] of Object.entries(context.attributes ?? {})) {
    pushKV(metadata, k, v);
  }

  return {
    feedback: {
      text: '',
      answers: [],
      metadata,
      metrics,
      profile,
      finished: false,
    },
    publicKey: keys.publicKey,
    integration: keys.integration,
    completed: false,
    // finished: false,
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
            }
          } catch {
            /* respuesta sin JSON — ignorar */
          }
        }
      })
      .catch((err) => options.log?.('[DeepdotsAnalytics] error enviando feedback', err));
  };
}
