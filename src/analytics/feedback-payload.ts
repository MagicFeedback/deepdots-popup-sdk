/**
 * Mapeo del envelope de analytics → body de `POST /sdk/feedback`.
 *
 * La analítica se envía como un Feedback del modelo del Surveys SDK, agrupado por una
 * INTEGRACIÓN creada en la plataforma. Se manda en streaming con `completed:false`; el
 * backend agrupa los lotes por `sessionId`, que genera el SDK al abrir cada sesión. El
 * ÚLTIMO lote de una sesión (cierre de página, app a background, cambio de usuario) va con
 * `completed:true`: cierra el registro y el lote siguiente abre otro con un sessionId nuevo.
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
import type { KeyValueStorage } from '../tracking/tracking-manager';

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
  /** sessionId de la sesión (lo genera el SDK): el backend agrupa todos sus lotes en un solo registro. */
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
   * El body lleva el `sessionId` de la sesión que se cierra; el lote siguiente abre otro
   * registro con un sessionId nuevo.
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
   * @deprecated Se ignora. El flush final salía por `sendBeacon`, que va SIEMPRE con
   * credenciales; contra la API (`Access-Control-Allow-Origin: *` + `Allow-Credentials:
   * true`) el preflight fallaba y el lote de cierre, el único con `completed:true`, no
   * llegaba nunca. Ahora sale por `fetch` con `keepalive`. Se mantiene en el tipo para no
   * romper a quien lo pase.
   */
  sendBeaconImpl?: (url: string, body: Blob | string) => boolean;
  /**
   * Registro en el que seguir desde el primer lote: el de una sesión suspendida por un
   * `pagehide` y reanudada tras recargar la página (ver `suspended-session.ts`).
   */
  initialSessionId?: string;
  /**
   * Genera el sessionId de cada sesión (default: UUID v4). Inyectable para tests.
   */
  newSessionId?: () => string;
  /**
   * Persistencia de los lotes pendientes (React Native: MMKV). Con él, el lote de cierre se
   * guarda antes de enviarse y cualquier lote que falle sobrevive a que la app muera: el sink
   * del arranque siguiente lo reenvía a su registro. Sin él, los pendientes viven en memoria.
   */
  storage?: KeyValueStorage;
  /** Reloj inyectable (tests). */
  now?: () => number;
  /** Callback invocado cuando la API acepta el primer lote de una sesión (registro abierto). */
  onSessionId?: (id: string) => void;
  /** Callback invocado al cerrar la sesión (`completed:true`): el sessionId cacheado se olvida. */
  onSessionReset?: () => void;
  /**
   * Callback invocado cuando el backend acepta el lote de cierre, con el sessionId del
   * registro cerrado. Ese registro se convierte en Feedback en segundos.
   */
  onSessionClosed?: (id: string) => void;
}

/** Límite práctico de `fetch({keepalive:true})` (~64KB en Chrome). */
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

/** Un lote ya construido a la espera de entregarse. */
interface PendingBatch {
  body: AnalyticsFeedbackBody;
  /** Cuándo se construyó (ms epoch): los de más de PENDING_MAX_AGE_MS se descartan al cargar. */
  at: number;
}

/** Techo de lotes pendientes; al superarlo se descartan los más antiguos. */
const PENDING_MAX = 50;
/** Un pendiente más viejo ya no se reenvía: el backend cerró ese registro hace mucho. */
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Un POST que no responde en este tiempo se da por fallido y se reintenta: un `fetch` sin
 * respuesta (la app pasó a background con él en vuelo) no puede retener el resto de envíos.
 */
const POST_TIMEOUT_MS = 20_000;

/** Clave de los pendientes en el storage, una por integración. */
function pendingKey(integration: string): string {
  return `__deepdots_analytics_pending__:${integration}`;
}

/** UUID v4. `crypto.randomUUID` no existe en todos los runtimes (Hermes, navegadores viejos). */
export function generateSessionId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Sink real: transforma el envelope y hace `POST {baseUrl}/sdk/feedback`.
 *
 * El `sessionId` de cada sesión lo genera el SDK (UUID) y va en TODOS sus lotes, desde el
 * primero. La API guarda cada lote bajo el sessionId que recibe, así que una sesión es un
 * registro aunque no llegue ninguna respuesta. Antes lo asignaba la API en la respuesta del
 * primer POST: si esa respuesta se perdía (la app pasaba a background con el POST en vuelo),
 * el resto de la sesión acababa en otro registro.
 *
 * Garantías de entrega:
 *  - un lote que falla de forma transitoria (red, 5xx, 408, 429, sin respuesta en
 *    POST_TIMEOUT_MS) se guarda TAL CUAL —con su sessionId y su `completed`— y se reenvía
 *    antes del lote siguiente. Nunca vuelve al buffer del manager: allí se mezclaba con la
 *    sesión siguiente y viajaba con su registro. La promesa del sink no rechaza;
 *  - con `storage` (React Native) los pendientes sobreviven a que la app muera: el lote de
 *    cierre se guarda ANTES de enviarse y el sink del arranque siguiente lo reenvía. La API
 *    descarta los eventos repetidos de una misma sesión al ensamblarla;
 *  - `keepalive` para que el navegador no cancele el POST al navegar fuera ni al cerrar la
 *    página (sin `sendBeacon`: ver `sendBeaconImpl`);
 *  - sin credenciales, que es lo único que pasa el CORS de la API (`Allow-Origin: *`);
 *  - un 4xx se loguea y se descarta.
 */
export function createFeedbackSink(options: FeedbackSinkOptions): AnalyticsSink {
  const url = `${options.baseUrl}/sdk/feedback`;
  const newSessionId = options.newSessionId ?? generateSessionId;
  const now = options.now ?? (() => Date.now());
  const storageKey = pendingKey(options.keys.integration);

  /** Registro de la sesión en curso; se crea con el primer lote y se olvida al cerrarla. */
  let feedbackSessionId: string | undefined = options.initialSessionId || undefined;
  /** Sesión ya avisada como abierta (`onSessionId`). La reanudada la avisa el host. */
  let announcedId: string | undefined = feedbackSessionId;

  const pending: PendingBatch[] = loadPending();
  let draining: Promise<void> | null = null;

  function loadPending(): PendingBatch[] {
    if (!options.storage) return [];
    try {
      const raw = options.storage.getItem(storageKey);
      const list = raw ? (JSON.parse(raw) as PendingBatch[]) : [];
      return Array.isArray(list) ? list.filter((p) => p?.body && now() - p.at <= PENDING_MAX_AGE_MS) : [];
    } catch {
      return [];
    }
  }

  function savePending(): void {
    if (!options.storage) return;
    try {
      if (pending.length) options.storage.setItem(storageKey, JSON.stringify(pending));
      else options.storage.removeItem(storageKey);
    } catch {
      /* sin storage los pendientes viven solo en memoria */
    }
  }

  function addPending(batch: PendingBatch): void {
    pending.push(batch);
    if (pending.length > PENDING_MAX) pending.splice(0, pending.length - PENDING_MAX);
    savePending();
  }

  function removePending(batch: PendingBatch): void {
    const i = pending.indexOf(batch);
    if (i >= 0) pending.splice(i, 1);
    savePending();
  }

  /** Un POST. 'retry' = fallo transitorio; 'drop' = la API lo rechazó (4xx) o no hay fetch. */
  async function post(body: AnalyticsFeedbackBody, final: boolean): Promise<'ok' | 'retry' | 'drop'> {
    const json = JSON.stringify(body);
    const small = json.length <= KEEPALIVE_MAX_BYTES;

    // Sin `sendBeacon` a propósito, también en el cierre de página (ver `sendBeaconImpl`):
    // `keepalive` sobrevive igual al unload y, sin credenciales, pasa el preflight de la API.
    if (final) options.log?.('[DeepdotsAnalytics] final flush via fetch keepalive');

    const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      options.log?.('[DeepdotsAnalytics] no fetch available; payload not sent', body);
      return 'drop';
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        // La API autentica por `publicKey` en el body y responde `Allow-Origin: *`: una
        // petición con credenciales fallaría el CORS. Explícito para no depender del default.
        credentials: 'omit',
        // keepalive: el POST sobrevive a la navegación mientras el body sea pequeño.
        ...(small ? { keepalive: true } : {}),
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), POST_TIMEOUT_MS);
      });
      const res = await Promise.race([request, timeout]);
      if (res.ok) return 'ok';
      const detail = await safeBodyText(res);
      if (isRetryableStatus(res.status)) {
        options.log?.(`[DeepdotsAnalytics] POST /sdk/feedback ${res.status} (retryable): ${detail}`);
        return 'retry';
      }
      options.log?.(
        `[DeepdotsAnalytics] POST /sdk/feedback rejected with ${res.status}; batch DISCARDED:`,
        detail,
      );
      return 'drop';
    } catch (error) {
      options.log?.('[DeepdotsAnalytics] POST /sdk/feedback failed (will retry):', error);
      return 'retry';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Avisos al host tras entregar un lote. Un fallo del callback no afecta al envío. */
  function delivered(body: AnalyticsFeedbackBody): void {
    const id = body.sessionId;
    if (!id) return;
    try {
      if (body.completed) {
        options.onSessionClosed?.(id);
      } else if (id === feedbackSessionId && id !== announcedId) {
        // Solo la sesión EN CURSO: un lote que responde después de su cierre no la reabre.
        announcedId = id;
        options.log?.('[DeepdotsAnalytics] feedback session open:', id);
        options.onSessionId?.(id);
      }
    } catch {
      /* el callback del host no puede romper el envío */
    }
  }

  /** Entrega un lote y, si falla de forma transitoria, lo deja pendiente. */
  async function send(batch: PendingBatch, final: boolean, alreadyPending: boolean): Promise<void> {
    const result = await post(batch.body, final);
    if (result === 'retry') {
      if (!alreadyPending) addPending(batch);
      return;
    }
    if (alreadyPending) removePending(batch);
    if (result === 'ok') delivered(batch.body);
  }

  /**
   * Reenvía los pendientes en orden y para en el primero que vuelva a fallar. Cada llamada
   * encadena una pasada sobre la lista VIVA, así que un lote añadido mientras otra pasada está
   * en curso sale en la suya en vez de quedarse esperando al envío siguiente.
   */
  function drain(): Promise<void> {
    const run = async () => {
      for (let i = 0; i < pending.length; ) {
        const batch = pending[i];
        await send(batch, false, true);
        if (pending[i] === batch) return; // sigue fallando: el resto, en el próximo envío
      }
    };
    // Sin otra pasada en curso arranca YA: el primer POST sale en esta misma tarea, que en un
    // `pagehide` puede ser la última que ejecute la página.
    const next = draining ? draining.then(run) : run();
    draining = next;
    void next.finally(() => {
      if (draining === next) draining = null;
    });
    return next;
  }

  // Pendientes de una ejecución anterior (la app murió con ellos): se reenvían ya.
  if (pending.length) {
    savePending(); // sin los caducados
    setTimeout(() => void drain(), 0);
  }

  return async (envelope: AnalyticsEnvelope, meta) => {
    if (meta?.resetSession) {
      // Sesión cerrada por el backend: no se envía nada, solo se olvida el registro.
      feedbackSessionId = undefined;
      options.onSessionReset?.();
      return;
    }
    const final = meta?.final === true;
    const sessionEnd = meta?.sessionEnd === true;

    if (!feedbackSessionId) feedbackSessionId = newSessionId();
    const body = buildAnalyticsFeedbackBody(envelope, options.keys, feedbackSessionId, { sessionEnd });
    options.log?.('[DeepdotsAnalytics] POST /sdk/feedback →', body);
    const batch: PendingBatch = { body, at: now() };

    if (sessionEnd) {
      // Registro cerrado con `completed:true`: el lote siguiente abre otro con un id nuevo.
      feedbackSessionId = undefined;
      options.onSessionReset?.();
      // El cierre es lo que se pierde si la app muere: se guarda ANTES de enviarlo.
      addPending(batch);
      await drain();
      return;
    }

    const retries = pending.length ? drain() : null;
    await Promise.all([retries, send(batch, final, false)]);
  };
}
