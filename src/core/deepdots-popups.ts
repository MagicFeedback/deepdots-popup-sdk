import {
    DeepdotsConfig,
    TriggerConfig,
    DeepdotsEvent,
    DeepdotsEventType,
    EventListener,
    DeepdotsInitParams,
    DeepdotsLogger,
    PopupDefinition,
    PopupTriggerCondition,
    PopupActions,
    PopupTrigger,
    PopupTriggerConditionStatus,
    POPUP_TRIGGER_CONDITION_STATUSES, POPUPSESSIONSTATUS,
    PopupStyle,
    SessionEndReason,
} from '../types';
// renderPopup se carga de forma PEREZOSA (dynamic import) para no arrastrar
// `@magicfeedback/native` (browser) ni el CSS al importar el SDK en entornos sin DOM (React Native).
import { setupTrigger } from '../triggers';
import { resolveEnvironment } from '../config/env';
import { PopupRenderer, createDefaultRenderer } from '../platform/renderer';
import { TrackingManager, createDefaultStorage, type KeyValueStorage } from '../tracking/tracking-manager';
import { AnalyticsManager, createDryRunSink, type AnalyticsEnvelope } from '../analytics/analytics-manager';
import { createFeedbackSink } from '../analytics/feedback-payload';
import { NavigationObserver } from '../tracking/navigation-observer';
import { collectDeviceInfo } from '../analytics/device-info';
import { readCachedGeo, writeCachedGeo, fetchGeo } from '../analytics/geo-info';
import { resolveLanguage } from '../analytics/language';
import { EngagementTracker } from '../analytics/engagement-tracker';
import { ContactManager, type ContactAttributes } from '../contact/contact-manager';
import { CrashReporter, crashRecordToParams, type ReportErrorOptions, type ReactNativeErrorUtils } from '../analytics/crash-reporter';
import { setLogger } from '../util/logger';
import { buildMessageParams, MessageGuard, type MessageStage, type TrackMessageOptions } from '../analytics/messaging';

const EXIT_QUEUE_STORAGE_KEY = '__deepdots_exit_popup_queue__';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_MAX_BATCH_SIZE = 20;
const ANALYTICS_FLUSH_INTERVAL_MS = 30_000;
/** Namespace reservado para los eventos que emite el propio SDK (page_view, message, mini_service…). */
const RESERVED_EVENT_PREFIX = 'deepdots_';
/** Prefijo que se antepone a los eventos custom del host para poder identificarlos frente a los reservados. */
const CUSTOM_EVENT_PREFIX = 'deepdots_event_';

interface DeferredExitPopup {
    id: string;
    surveyId: string;
    dueAt: number;
    sourceUrl: string;
}

interface LegacyPopupTriggerCondition {
    answered?: boolean;
    cooldownDays?: number;
}

interface PopupProgressState {
    status: PopupTriggerConditionStatus;
    timestamp: number;
}

type NormalizedPopupDefinition = PopupDefinition & {
    legacyConditions?: LegacyPopupTriggerCondition[];
};

/**
 * Main class for managing survey popups
 */
export class DeepdotsPopups {
    private config: DeepdotsConfig | null = null;
    private listeners: Map<DeepdotsEventType, Set<EventListener>> = new Map();
    private triggers: TriggerConfig[] = [];
    private initialized = false;
    private renderer: PopupRenderer = createDefaultRenderer();
    /** Logger para el output de debug. Default `console`; el host puede inyectar el suyo en init(). */
    private logger: DeepdotsLogger = console;
    private popupContainer: HTMLElement | null = null; // deprecated: mantenido para compatibilidad interna
    private popupDefinitions: NormalizedPopupDefinition[] = [];
    private popupsLoaded = false;
    private pendingAutoLaunch = false;

    private answeredSurveys: Set<string> = new Set();
    private surveyProgress: Map<string, PopupProgressState> = new Map();
    private lastShown: Map<string, number> = new Map(); // popupId -> timestamp mostrado
    private surveyToPopupId: Map<string, string> = new Map(); // surveyId -> popupId
    private deferredExitTimers: number[] = [];

    private baseUrl: string = '';
    private env: 'production' | 'development' = 'production';
    /** Si el SDK pinta el "modal" del popup (RN). Default true; false = el host lo envuelve. */
    private renderChrome = true;
    /** Barra de progreso. undefined = la decide la plataforma (style.showProgressBar). */
    private showProgressBar: boolean | undefined = undefined;
    /** CSS del host inyectado al final de los estilos del popup. */
    private surveyCss: string | undefined = undefined;

    /** Identidad + sesión (Fase 1 tracking). Null hasta init(). */
    private tracking: TrackingManager | null = null;
    /** Capa de analytics (canal separado del feedback). Null hasta init(). */
    private analytics: AnalyticsManager | null = null;
    /** feedbackSessionId cacheado del canal de analytics (devuelto por POST /sdk/feedback). */
    private analyticsFeedbackSessionId: string | undefined = undefined;
    /** Timer del flush periódico de analytics (cada ANALYTICS_FLUSH_INTERVAL_MS). */
    private analyticsFlushTimer: ReturnType<typeof setInterval> | undefined = undefined;
    /** Crash & error reporting (#14–17). Null hasta init(). */
    private crashReporter: CrashReporter | null = null;
    /** Protecciones del funnel de Messaging (#18–22). Vigencia de sesión: se reinicia en init(). */
    private messageGuard = new MessageGuard();
    /** Observador de navegación (Fase 2): emite page_view por el canal de analytics. */
    private navObserver: NavigationObserver | null = null;
    /** Tiempo activo (engagement time, #8). */
    private engagement: EngagementTracker | null = null;
    /** Atributos internos del usuario identificado → POST /sdk/popups/contact. Null si no hay userId. */
    private contact: ContactManager | null = null;
    /** Storage resuelto en init() (inyectado por el host o localStorage). Reusado al cambiar de usuario. */
    private storage: KeyValueStorage | null = null;
    /** Marca si ya se inició la navegación manual (setScreen) — para RN sin History API. */
    private navStarted = false;
    /**
     * `true` entre `session_start` y `session_end`. Hace idempotente tanto la apertura como
     * el cierre (p. ej. `visibilitychange` + `pagehide` seguidos) y permite abrir una sesión
     * nueva al volver a foreground o al conceder el consentimiento más tarde.
     */
    private sessionOpen = false;
    /**
     * Idioma resuelto en init() (explícito > navigator.language > Intl). Única fuente de
     * verdad para el context de analytics Y para la segmentación por idioma de los popups.
     */
    private language: string | undefined = undefined;

    /** Initialize the SDK with configuration */
    init(config: DeepdotsInitParams): void {
        this.logger = config.logger ?? console;
        setLogger(this.logger); // los módulos sin `this` (renderPopup, renderers) enrutan por aquí
        if (this.initialized) {
            // Un init() con OTRO userId es un CAMBIO DE USUARIO (login/logout del host): cierra
            // la sesión anterior y cambia la identidad en caliente. Reinicializar de verdad
            // duplicaría listeners, timers y la carga de popups.
            const nextUserId = config.userId || undefined;
            if (nextUserId !== this.config?.userId) {
                this.setUserId(nextUserId);
                return;
            }
            this.log('SDK already initialized');
            return;
        }

        const env = resolveEnvironment(config.nodeEnv);

        this.baseUrl = env.apiBaseUrl;
        this.env = config.nodeEnv || 'production';
        this.renderChrome = config.renderChrome ?? true;
        this.showProgressBar = config.showProgressBar;
        this.surveyCss = config.surveyCss;

        this.config = {
            apiKey: config.apiKey || undefined,
            debug: config.debug || false,
            userId: config.userId || undefined,
        } as DeepdotsConfig;

        // user_id lo gestiona el SDK (persistente); el session_id lo provee el backend
        // (respuesta de POST /sdk/popups) y se cachea — el SDK no genera ni expira sesiones.
        const storage = config.storage ?? createDefaultStorage();
        this.storage = storage;
        this.tracking = new TrackingManager({
            storage,
            clientUserId: this.config.userId,
            enabled: config.trackingEnabled ?? true,
        });

        // Contact: info interna del usuario que solo conoce el host (segmentación/targeting).
        // Solo trackeamos usuarios IDENTIFICADOS → se crea únicamente si hay userId del init.
        if (this.config.userId) {
            const userId = this.config.userId;
            const publicKey = this.config.apiKey ?? '';
            this.contact = new ContactManager({
                storage,
                publicKey,
                userId,
                post: (body) => this.postContact(body),
            });
            // Atributos de contact pasados en init: envío fire-and-forget (solo si cambiaron).
            if (config.contactAttributes) {
                void this.setContactAttributes(config.contactAttributes);
            }
        }
        this.log('tracking · user_id:', this.tracking.getUserId(), '· new_user:', this.tracking.isNewUser(), '· enabled:', this.tracking.isTrackingEnabled());

        // Analytics: se envía como Feedback a la integración (`POST /sdk/feedback`) si se
        // pasan claves en init.analytics; si no, queda en dry-run (solo console.log).
        const analyticsSink = config.analytics
            ? createFeedbackSink({
                  baseUrl: this.baseUrl,
                  keys: config.analytics,
                  log: (...a) => this.log(...a),
                  // sendBeacon: único transporte que sobrevive al cierre de la página.
                  sendBeaconImpl:
                      typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
                          ? (url, body) => navigator.sendBeacon(url, body)
                          : undefined,
                  onSessionId: (id) => { this.analyticsFeedbackSessionId = id; },
                  onSessionReset: () => { this.analyticsFeedbackSessionId = undefined; },
              })
            : createDryRunSink((...a) => this.logger.log(...a));
        const device = config.device ?? collectDeviceInfo(config.appVersion);
        this.language = resolveLanguage({
            explicit: config.language,
            navigator: typeof navigator !== 'undefined' ? navigator : undefined,
            intl: typeof Intl !== 'undefined' ? Intl : undefined,
        });
        this.messageGuard.reset();
        this.analytics = new AnalyticsManager({
            sink: analyticsSink,
            publicKey: config.analytics?.publicKey ?? this.config.apiKey,
            language: this.language,
            platform: config.platform ?? 'web',
            device,
            maxBatchSize: ANALYTICS_MAX_BATCH_SIZE,
            onFlushNeeded: () => this.flushAnalytics(),
        });
        // Crash & error reporting (#14–17): captura errores no manejados (a disco, replay
        // en el siguiente arranque) y expone reportError() para el host (emite ya).
        this.crashReporter = new CrashReporter({
            storage,
            emit: (params) => this.track('deepdots_app_crash', params),
            device: () => ({ appVersion: device.app_version, osVersion: device.os_version, deviceModel: device.device_model }),
            sessionId: () => this.tracking?.getSessionId() ?? null,
            now: () => Date.now(),
            enabled: () => this.tracking?.isTrackingEnabled() ?? false,
        });
        if (this.tracking?.isTrackingEnabled()) {
            this.crashReporter.install();
        }
        // Geolocalización por IP: aplica el cache persistente de inmediato (sin gap de timing)
        // y refresca en background (cadena de proveedores + timeout), recacheando el resultado.
        const cachedGeo = readCachedGeo(storage, Date.now());
        if (cachedGeo) this.analytics.updateDevice(cachedGeo);
        fetchGeo()
            .then((geo) => {
                if (geo) {
                    this.analytics?.updateDevice(geo);
                    writeCachedGeo(storage, geo, Date.now());
                }
            })
            .catch(() => {});
        // Fase 2: navegación → eventos page_view por el canal de analytics.
        this.navObserver = new NavigationObserver();
        this.navObserver.onVisit((v) => this.track('deepdots_page_view', { screen: v.screen, duration_seconds: v.durationSeconds }));
        this.navObserver.install();
        // Engagement time (#8): cuenta tiempo activo en primer plano.
        this.engagement = new EngagementTracker();
        this.engagement.resume();
        this.setupAnalyticsFlush();
        // Marca de inicio de sesión (base para Crash-Free Users #14).
        this.openSession();
        // Drena SIEMPRE la cola (descarta los pendientes si tracking está off, spec §7);
        // solo reenvía como evento cuando el tracking está activo.
        const pendingCrashes = this.crashReporter.drainPendingCrashes();
        if (this.tracking?.isTrackingEnabled()) {
            for (const rec of pendingCrashes) {
                this.track('deepdots_app_crash', crashRecordToParams(rec));
            }
        }

        this.initialized = true;
        this.log('SDK initialized', this.config);
        if (this.renderer.init) this.renderer.init();
        this.setupPopupContainer();

        // Los popups SIEMPRE se reciben de la API (no se definen en init).
        this.fetchPopupsFromServer().then((defs) => {
            this.popupDefinitions = this.validatePopupDefinitions(defs);
            this.popupsLoaded = true;
            this.log('Popups loaded from API', this.popupDefinitions);
            this.configureTriggersFromDefinitions();
            this.processDeferredExitQueue();
            if (this.pendingAutoLaunch) {
                this.startTriggers();
            }
        });
    }

    /** User id actual (generado por el SDK o provisto por el cliente). Null si tracking off. */
    getUserId(): string | null {
        return this.tracking?.getUserId() ?? null;
    }

    /** Session id de navegación actual. Null si tracking off. */
    getSessionId(): string | null {
        return this.tracking?.getSessionId() ?? null;
    }

    /** Activa/desactiva el tracking (identidad + sesión + analytics). Kill-switch del contrato §7bis. */
    setTrackingEnabled(enabled: boolean): void {
        // Al revocar el consentimiento se cierra la sesión ANTES de apagar el canal: si no, lo
        // acumulado se quedaría sin enviar y el registro abierto sin cerrar.
        if (!enabled) this.closeSession('tracking_disabled');
        this.tracking?.setTrackingEnabled(enabled);
        // Consentimiento concedido (ahora o más tarde que el init): abre sesión.
        if (enabled) this.openSession();
        this.log('tracking · setTrackingEnabled:', enabled, '· session_id:', this.tracking?.getSessionId() ?? null);
    }

    // ───────── Analytics (canal separado del feedback, vinculado por user_id) ─────────

    /** Registra un evento de analítica (modelo GA: nombre + params). No-op si tracking off. */
    track(name: string, params?: Record<string, unknown>): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        // Los eventos del SDK ya van en el namespace `deepdots_`; los custom del host se
        // prefijan con `deepdots_event_` para poder distinguirlos en analítica.
        const eventName = name.startsWith(RESERVED_EVENT_PREFIX) ? name : `${CUSTOM_EVENT_PREFIX}${name}`;
        this.analytics?.track(eventName, params);
        this.log('analytics · track:', eventName, params ?? {});
    }

    /** User attributes para breakdowns (registration_status, pass_type, sector, pass_status…). */
    setUserAttributes(attributes: Record<string, string | number | boolean>): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.analytics?.setUserAttributes(attributes);
    }

    /**
     * Registra/actualiza una métrica (valor medible) → `feedback.metrics` del body.
     * Persistente y sobrescribe por key. No-op si tracking off.
     */
    setMetric(key: string, value: string | number | boolean): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.analytics?.setMetric(key, value);
        this.log('analytics · setMetric:', key, value);
    }

    /** Reporta un error del host (manejado o no) → evento `deepdots_app_crash`. No-op si tracking off. */
    reportError(error: unknown, options?: ReportErrorOptions): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.crashReporter?.reportError(error, options);
    }

    /** Engancha `global.ErrorUtils` de RN para capturar errores JS no manejados. No-op si tracking off. */
    installReactNativeCrashHandler(errorUtils: ReactNativeErrorUtils): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.crashReporter?.installReactNative(errorUtils);
    }

    /**
     * Info interna del usuario que solo conoce el host (idioma, edad, plan…), persistida en el
     * Contact del backend para segmentación/targeting de popups. Identificada por el `userId` del
     * init. Solo envía si los atributos cambiaron (diff en storage). No-op si tracking off o sin userId.
     * @returns `true` si se envió al backend, `false` si no hubo cambios o está deshabilitado.
     */
    async setContactAttributes(attributes: ContactAttributes): Promise<boolean> {
        if (!this.tracking?.isTrackingEnabled()) return false;
        if (!this.contact) return false;
        return this.contact.setAttributes(attributes);
    }

    /** Marca el inicio de un mini-service; etiqueta los eventos siguientes. No-op si tracking off. */
    enterMiniService(name: string, entryPointType?: string): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.analytics?.enterMiniService(name, entryPointType);
        this.log('analytics · enterMiniService:', name, entryPointType ?? '');
    }

    /** Cierra el mini-service `name` (emite `mini_service_exit` con duración, #27). No-op si tracking off o si ese no está activo. */
    exitMiniService(name: string): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.analytics?.exitMiniService(name);
        this.log('analytics · exitMiniService:', name);
    }

    /** Findability (#31/#35): registra una búsqueda. `has_results` se deriva de `resultsCount`. */
    trackSearch(query: string, resultsCount: number, params?: Record<string, unknown>): void {
        this.track('deepdots_search', { query, results_count: resultsCount, has_results: resultsCount > 0, ...(params ?? {}) });
    }

    /** Findability friction (#34/#35): señal de fricción con su `friction_topic`. */
    trackFindabilityFriction(frictionTopic: string, params?: Record<string, unknown>): void {
        this.track('deepdots_findability_friction', { friction_topic: frictionTopic, ...(params ?? {}) });
    }

    /** Funnel: un paso del embudo, correlacionado por `taskId`. El backend reconstruye conversión/drop-off/tiempo. */
    trackFunnelStep(funnel: string, step: string, taskId: string, params?: Record<string, unknown>): void {
        this.track('deepdots_funnel_step', { funnel, step, task_id: taskId, ...(params ?? {}) });
    }

    /**
     * Product Effectiveness: una interacción significativa del usuario (`interaction_type` es la
     * dimensión de agrupación, p. ej. `get_help`, `homepage`, `contact_support`).
     *
     * Existe como evento RESERVADO para que la convención no la invente cada host: un `track()`
     * custom acaba como `deepdots_event_…` y no lo cuenta la analítica de effectiveness.
     * Un `interactionType` vacío se descarta con warning (no aporta dato agrupable).
     */
    trackMeaningfulInteraction(interactionType: string, params?: Record<string, unknown>): void {
        const type = typeof interactionType === 'string' ? interactionType.trim() : '';
        if (!type) {
            // Siempre visible (como en `trackMessage`): es un error de integración del host.
            console.warn('[DeepdotsPopups] trackMeaningfulInteraction discarded: empty interaction_type');
            return;
        }
        this.track('deepdots_meaningful_interaction', { interaction_type: type, ...(params ?? {}) });
    }

    /**
     * Messaging (#18–22): registra una etapa del funnel de una notificación (push/in-app).
     * No-op si tracking off. El evento se descarta (con warning) si el `channel` no es válido,
     * si ese `(message_id, stage)` ya se emitió en la sesión, o si el `message_id` ya se reportó
     * en otro canal — ver `MessageGuard`.
     */
    trackMessage(stage: MessageStage, options: TrackMessageOptions): void {
        const verdict = this.messageGuard.evaluate(stage, options);
        if (!verdict.emit) {
            console.warn(`[DeepdotsPopups] trackMessage discarded (${verdict.reason}): ${verdict.detail}`);
            return;
        }
        this.track('deepdots_message', buildMessageParams(stage, options));
    }

    /**
     * Navegación MANUAL (entornos sin History API, p. ej. React Native con React Navigation).
     * El host la llama en cada cambio de pantalla; emite `page_view` al salir de la anterior.
     */
    setScreen(name: string): void {
        if (!this.navObserver) return;
        if (!this.navStarted) {
            this.navObserver.begin(name);
            this.navStarted = true;
        } else {
            this.navObserver.visit(name);
        }
    }

    /** App a foreground (RN: AppState 'active'): reanuda el engagement time y abre sesión nueva. */
    onForeground(): void {
        this.engagement?.resume();
        this.openSession();
    }

    /**
     * App a background (RN: AppState 'background'): FIN DE SESIÓN. Cierra pantalla actual
     * (page_view), mini-services (mini_service_exit), emite engagement + `session_end` y
     * envía el último lote con `completed:true`.
     *
     * Es la única señal disponible en móvil: el kill de la app (swipe) NO da callback.
     */
    onBackground(): void {
        this.closeSession('background');
        this.engagement?.pause();
    }

    /**
     * Cierre EXPLÍCITO de la sesión por parte del host (logout, fin de flujo…): emite
     * `session_end` y envía el último lote con `completed:true`.
     */
    endSession(): void {
        this.closeSession('manual');
    }

    /**
     * Cambio de usuario (login / logout / cambio de cuenta). Cierra la sesión del usuario
     * anterior (`session_end` con `reason: 'user_change'` + `completed:true`), cambia la
     * identidad y abre una sesión nueva. Sin `userId` vuelve al id anónimo del SDK.
     *
     * Equivale a llamar a `init()` otra vez con otro `userId`.
     */
    setUserId(userId?: string): void {
        const next = userId || undefined;
        if (!this.initialized || !this.config || next === this.config.userId) return;

        this.closeSession('user_change');

        const enabled = this.tracking?.isTrackingEnabled() ?? true;
        const storage = this.storage ?? createDefaultStorage();
        this.config.userId = next;
        this.tracking = new TrackingManager({ storage, clientUserId: next, enabled });
        // El Contact solo existe para usuarios identificados.
        this.contact = next
            ? new ContactManager({
                  storage,
                  publicKey: this.config.apiKey ?? '',
                  userId: next,
                  post: (body) => this.postContact(body),
              })
            : null;
        // Atributos, métricas y protecciones de messaging pertenecían al usuario anterior.
        this.analytics?.resetUserScope();
        this.messageGuard.reset();

        this.log('tracking · user_change · user_id:', this.tracking.getUserId());
        this.openSession();
    }

    /**
     * Cierra la sesión actual: vuelca todo lo que quedaba abierto y envía el último lote
     * marcado con `completed:true`, para que el backend cierre el registro. El `sessionId`
     * cacheado se olvida → el lote siguiente abre un registro nuevo.
     *
     * Idempotente: dos cierres seguidos (p. ej. `visibilitychange` + `pagehide`) no duplican
     * el `session_end`.
     */
    private closeSession(reason: SessionEndReason): void {
        if (!this.sessionOpen) return;
        if (!this.tracking?.isTrackingEnabled()) return;
        this.sessionOpen = false;

        this.navObserver?.stop(); // cierra la pantalla actual → page_view
        this.navStarted = false;
        this.analytics?.exitAllMiniServices(); // → mini_service_exit con duración
        this.flushEngagement(); // → user_engagement con el tiempo activo
        this.track('deepdots_session_end', { reason });
        // `final` solo cuando el documento se está muriendo: ahí hace falta sendBeacon.
        this.flushAnalytics({ final: reason === 'page_hide', sessionEnd: true });
        // El session_id del canal de analytics y el de popups pertenecían a la sesión cerrada.
        this.analyticsFeedbackSessionId = undefined;
        this.tracking?.setSessionId(null);
        this.log('tracking · session_end:', reason);
    }

    /**
     * Abre sesión (`session_start`) si no hay una abierta y el tracking está activo. Idempotente:
     * se llama en init(), al volver a foreground y al conceder el consentimiento.
     */
    private openSession(): void {
        if (this.sessionOpen) return;
        if (!this.tracking?.isTrackingEnabled()) return;
        this.sessionOpen = true;
        this.track('deepdots_session_start', {});
    }

    /** Payload que se ENVIARÍA al endpoint de analytics (no envía ni vacía el buffer). */
    previewAnalytics(): AnalyticsEnvelope {
        return (
            this.analytics?.buildPayload(this.analyticsIdentity()) ?? {
                userId: null,
                sessionId: null,
                context: { platform: 'web', attributes: {} },
                events: [],
            }
        );
    }

    /**
     * Envía el lote acumulado de analytics y vacía el buffer.
     * `final: true` (cierre de página/app) cambia el transporte a `sendBeacon`, que sobrevive
     * al unload; un lote que falle por red o 5xx se re-encola para el siguiente flush.
     */
    flushAnalytics(options?: { final?: boolean; sessionEnd?: boolean }): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.analytics?.flush(this.analyticsIdentity(), options);
    }

    /** Emite un evento `user_engagement` con el tiempo activo acumulado (#8). */
    private flushEngagement(): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        const ms = this.engagement?.consume() ?? 0;
        if (ms > 0) this.track('deepdots_user_engagement', { engagement_time_msec: ms });
    }

    private analyticsIdentity() {
        return {
            userId: this.tracking?.getUserId() ?? null,
            sessionId: this.tracking?.getSessionId() ?? null,
        };
    }

    /** Flush automático al ocultar/cerrar la página (no perder el lote pendiente). */
    private setupAnalyticsFlush(): void {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        // flush periódico mientras la app está en primer plano
        this.analyticsFlushTimer = setInterval(() => this.flushAnalytics(), ANALYTICS_FLUSH_INTERVAL_MS);
        // al cerrar la página: FIN DE SESIÓN (page_view + mini_service_exit + engagement +
        // session_end) y último lote con completed:true vía sendBeacon.
        window.addEventListener('pagehide', () => {
            clearInterval(this.analyticsFlushTimer);
            this.closeSession('page_hide');
        });
        // al ocultar/mostrar la pestaña: pausar/reanudar engagement y enviar lo acumulado
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flushEngagement();
                this.engagement?.pause();
                this.flushAnalytics();
            } else if (document.visibilityState === 'visible') {
                this.engagement?.resume();
            }
        });
    }

    /** Enable auto-launch functionality with configured triggers */
    autoLaunch(): void {
        if (!this.initialized) {
            throw new Error('SDK not initialized. Call init() first.');
        }
        if (!this.popupsLoaded) {
            this.pendingAutoLaunch = true;
            this.log('Auto-launch deferred until popups are loaded');
            return;
        }
        this.startTriggers();
    }

    /** Inicia los triggers configurados */
    private startTriggers(): void {
        this.log('Auto-launch enabled');
        this.triggers.forEach((trigger) => setupTrigger(this, trigger));
    }

    /** Configure triggers for auto-launching popups (manual) */
    configureTriggers(triggers: TriggerConfig[]): void {
        if (!this.initialized) {
            throw new Error('SDK not initialized. Call init() first.');
        }
        this.triggers = triggers;
        this.log('Triggers configured', triggers);
    }

    /** Deriva triggers desde las definiciones de popup */
    private configureTriggersFromDefinitions(): void {
        const derived: TriggerConfig[] = [];
        this.debug('Validated popup definitions', this.popupDefinitions);

        this.popupDefinitions.forEach((def) => {
            def.triggers.forEach((trigger) => {
                const type = this.mapPopupTriggerType(trigger.type);
                if (!type) {
                    this.debug('Unsupported trigger type', trigger.type);
                    return;
                }
                const value = type === 'time' && typeof trigger.value === 'number'
                    ? trigger.value * 1000
                    : trigger.value;
                derived.push({ type, value, surveyId: def.surveyId, popupId: def.id });
            });
        });

        if (derived.length) {
            this.configureTriggers(derived);
        }
    }

    /** Lógica para evaluar condiciones antes de mostrar una encuesta */
    triggerSurvey(surveyId: string, popupId?: string): void {
        const def = this.findPopupDefinition(surveyId, popupId);
        if (!def) {
            this.debug('No popup definition for trigger', { surveyId, popupId });
            return;
        }
        if (!this.shouldShow(def)) {
            this.debug('Conditions prevented showing popup', def.id);
            return;
        }
        this.showDefinition(def);
    }

    /** Trigger popups configured with trigger.type = 'event' and matching trigger.value */
    public triggerEvent(eventName: string): void {
        if (!this.initialized) {
            throw new Error('SDK not initialized. Call init() first.');
        }
        const normalized = String(eventName || '').trim();
        if (!normalized) {
            this.debug('Ignoring empty event trigger name');
            return;
        }

        const candidates = this.popupDefinitions.filter((def) => {
            return def.triggers.some((trigger) => {
                const triggerValue = String(trigger.value ?? '').trim();
                return trigger.type === 'event' && triggerValue === normalized;
            });
        });

        if (!candidates.length) {
            this.debug('No event popup definitions found', { eventName: normalized });
            return;
        }

        const matched = candidates.find((def) => this.shouldShow(def));
        if (!matched) {
            this.debug('Event popup blocked by conditions/segments', { eventName: normalized });
            return;
        }

        this.showDefinition(matched);
    }

    private showDefinition(def: PopupDefinition): void {
        this.log('Showing popup (definition)', def);
        this.surveyToPopupId.set(def.surveyId, def.id);
        this.lastShown.set(def.id, Date.now());
        this.renderPopup(def.surveyId, def.productId, def.actions, def.style, def.title);
        this.emitEvent('popup_shown', def.surveyId, { popupId: def.id });
    }

    private shouldShow(def: NormalizedPopupDefinition, pathUrl?: string, skipPathCheck = false): boolean {
        if (!skipPathCheck && !this.matchesSegmentsPath(def, pathUrl)) {
            return false;
        }
        if (!this.matchesSegmentsLang(def)) {
            return false;
        }

        const cooldowns = def.cooldown || [];
        if (cooldowns.length && !cooldowns.every((cooldown) => this.evaluateCooldown(def, cooldown))) {
            return false;
        }

        const legacyConditions = def.legacyConditions || [];
        if (!legacyConditions.length) return true;
        return legacyConditions.every((condition) => this.evaluateLegacyCondition(def, condition));
    }

    private matchesSegmentsLang(def: PopupDefinition): boolean {
        const langs = def.segments?.lang;
        if (!langs || langs.length === 0) return true;

        // Mismo idioma que reporta el context de analytics: explícito > navigator.language
        // > Intl. ⚠️ NO leer `navigator.language` aquí: en React Native `navigator` existe
        // pero no tiene `language`, y `undefined.toLowerCase()` reventaba la evaluación
        // COMPLETA del trigger (no solo este popup).
        const currentLang = (this.language ?? '').toLowerCase();

        if (!currentLang) {
            this.debug('No language available for lang comparison', { popupId: def.id, langs });
            return true;
        }

        // Acepta si el idioma actual empieza con alguno de los configurados
        // ej: "en-US" coincide con segment "en". Ignora entradas no-string del backend.
        const matches = langs.some(
            (lang) => typeof lang === 'string' && currentLang.startsWith(lang.toLowerCase()),
        );
        if (!matches) {
            this.debug('Lang mismatch for popup', { popupId: def.id, langs, currentLang });
        }
        return matches;
    }

    private matchesSegmentsPath(def: PopupDefinition, pathUrl?: string): boolean {
        const paths = def.segments?.path;
        if (!paths || paths.length === 0) return true;
        if (typeof window === 'undefined' || !window.location) {
            this.debug('No window.location available for path comparison', { popupId: def.id, paths });
            return true;
        }

        const normalizedHref = this.normalizeUrl(pathUrl || window.location.href || '');
        const currentUrl = this.safeParseUrl(normalizedHref);
        const normalizedPath = this.normalizeUrl(currentUrl?.pathname || window.location.pathname || '');

        const matches = paths.some((rawCandidate) => {
            const candidate = this.normalizeUrl(rawCandidate);
            let match = false;
            if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
                match = normalizedHref === candidate;
            } else if (candidate.startsWith('/')) {
                match = normalizedHref.includes(candidate);
            } else {
                match = normalizedPath === candidate;
            }
            this.debug('Path comparison', {
                popupId: def.id,
                candidate,
                currentPath: normalizedPath,
                currentHref: normalizedHref,
                match,
            });
            return match;
        });

        if (!matches) {
            this.debug('No path match for popup', { popupId: def.id, paths, currentPath: normalizedPath });
        }

        return matches;
    }

    private evaluateCooldown(def: PopupDefinition, condition: PopupTriggerCondition): boolean {
        switch (condition.answered) {
            case 'SHOWED':
                return this.hasCooldownElapsed(this.lastShown.get(def.id), condition.cooldownDays);
            case 'PARTIAL':
            case 'COMPLETED': {
                const progress = this.surveyProgress.get(def.surveyId);
                if (!progress || progress.status !== condition.answered) {
                    return true;
                }
                return this.hasCooldownElapsed(progress.timestamp, condition.cooldownDays);
            }
            default:
                return true;
        }
    }

    private evaluateLegacyCondition(def: PopupDefinition, condition: LegacyPopupTriggerCondition): boolean {
        if (!condition.answered && this.answeredSurveys.has(def.surveyId)) {
            return false;
        }
        return this.hasCooldownElapsed(this.lastShown.get(def.id), condition.cooldownDays);
    }

    private hasCooldownElapsed(timestamp: number | undefined, cooldownDays?: number): boolean {
        if (!timestamp || !cooldownDays) {
            return true;
        }
        return Date.now() - timestamp >= cooldownDays * DAY_IN_MS;
    }

    /** Marcar encuesta como contestada externamente */
    public markSurveyAnswered(surveyId: string): void {
        this.answeredSurveys.add(surveyId);
        this.markSurveyProgress(surveyId, 'COMPLETED');
    }

    /** Queue an exit popup so it can render after navigation */
    public queueExitPopup(surveyId: string, delaySeconds: number, sourceUrl?: string, popupId?: string): void {
        const def = this.findPopupDefinition(surveyId, popupId);
        if (!def) {
            this.debug('No popup definition for exit trigger', { surveyId, popupId });
            return;
        }

        const originUrl = sourceUrl || (typeof window !== 'undefined' ? window.location.href : '');
        if (!originUrl) {
            this.debug('Exit popup skipped: missing source URL', { surveyId });
            return;
        }

        if (!this.shouldShow(def, originUrl)) {
            this.debug('Exit popup skipped by conditions/path', { popupId: def.id, sourceUrl: originUrl });
            return;
        }

        const safeDelayMs = Number.isFinite(delaySeconds) ? Math.max(0, delaySeconds * 1000) : 0;
        const deferred: DeferredExitPopup = {
            id: def.id,
            surveyId: def.surveyId,
            sourceUrl: this.normalizeUrl(originUrl),
            dueAt: Date.now() + safeDelayMs,
        };

        const queue = this.getDeferredExitQueue().filter((item) => !(item.id === deferred.id && item.sourceUrl === deferred.sourceUrl));
        queue.push(deferred);
        this.setDeferredExitQueue(queue);
        this.scheduleDeferredExitPopup(deferred);
        this.debug('Exit popup queued', deferred);
    }

    private processDeferredExitQueue(): void {
        const queue = this.getDeferredExitQueue();
        if (!queue.length) return;

        const pending: DeferredExitPopup[] = [];
        const now = Date.now();
        queue.forEach((item) => {
            const def = this.popupDefinitions.find((popup) => popup.id === item.id && popup.surveyId === item.surveyId);
            if (!def) {
                return;
            }
            if (item.dueAt <= now) {
                this.tryShowDeferredExitPopup(item);
                return;
            }
            pending.push(item);
            this.scheduleDeferredExitPopup(item);
        });
        this.setDeferredExitQueue(pending);
    }

    private scheduleDeferredExitPopup(item: DeferredExitPopup): void {
        if (typeof window === 'undefined') return;
        const delay = Math.max(0, item.dueAt - Date.now());
        const timer = window.setTimeout(() => this.tryShowDeferredExitPopup(item), delay);
        this.deferredExitTimers.push(timer);
    }

    private tryShowDeferredExitPopup(item: DeferredExitPopup): void {
        const def = this.popupDefinitions.find((popup) => popup.id === item.id && popup.surveyId === item.surveyId);
        if (!def) {
            this.removeDeferredExitPopup(item);
            return;
        }

        const currentUrl = typeof window !== 'undefined' ? this.normalizeUrl(window.location.href || '') : '';
        if (!currentUrl || currentUrl === this.normalizeUrl(item.sourceUrl)) {
            this.removeDeferredExitPopup(item);
            this.debug('Exit popup dropped because route did not change', item);
            return;
        }

        if (!this.shouldShow(def, undefined, true)) {
            this.removeDeferredExitPopup(item);
            this.debug('Exit popup skipped at render-time conditions', item);
            return;
        }

        this.showDefinition(def);
        this.removeDeferredExitPopup(item);
    }

    private findPopupDefinition(surveyId: string, popupId?: string): NormalizedPopupDefinition | undefined {
        if (popupId) {
            const byId = this.popupDefinitions.find((popup) => popup.id === popupId);
            if (byId) return byId;
        }
        return this.popupDefinitions.find((popup) => popup.surveyId === surveyId);
    }

    private removeDeferredExitPopup(item: DeferredExitPopup): void {
        const queue = this.getDeferredExitQueue().filter((entry) => !(entry.id === item.id && entry.sourceUrl === item.sourceUrl));
        this.setDeferredExitQueue(queue);
    }

    private getDeferredExitQueue(): DeferredExitPopup[] {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.sessionStorage.getItem(EXIT_QUEUE_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry: unknown): entry is DeferredExitPopup => {
                    if (typeof entry !== 'object' || entry === null) return false;
                    const item = entry as Partial<DeferredExitPopup>;
                    return typeof item.id === 'string'
                        && typeof item.surveyId === 'string'
                        && typeof item.sourceUrl === 'string'
                        && typeof item.dueAt === 'number'
                        && Number.isFinite(item.dueAt);
                })
                .map((item) => ({
                    ...item,
                    sourceUrl: this.normalizeUrl(item.sourceUrl),
                }));
        } catch {
            return [];
        }
    }

    private setDeferredExitQueue(queue: DeferredExitPopup[]): void {
        if (typeof window === 'undefined') return;
        try {
            if (!queue.length) {
                window.sessionStorage.removeItem(EXIT_QUEUE_STORAGE_KEY);
                return;
            }
            window.sessionStorage.setItem(EXIT_QUEUE_STORAGE_KEY, JSON.stringify(queue));
        } catch {
            // Ignore storage errors in host environments that block storage access.
        }
    }

    /** Fetch al servidor para obtener popups */
    private async fetchPopupsFromServer(): Promise<unknown[]> {
        const apiKey = this.config?.apiKey;
        const baseUrl = this.baseUrl;
        const userId = this.config?.userId;
        if (!apiKey || !baseUrl) {
            this.log('Missing apiKey or baseUrl. Skipping popups fetch.');
            return [];
        }
        const filter = userId ? { where: { userId } } : null;
        const query = filter ? `?filter=${encodeURIComponent(JSON.stringify(filter))}` : '';
        const endpoint = `${baseUrl}/sdk/${encodeURIComponent(apiKey)}/popups${query}`;
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                this.log('Failed to fetch popups', response.status, response.statusText);
                return [];
            }
            const raw = await response.text();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this.log('Unexpected popups payload', parsed);
                return [];
            }
            this.debug('Fetched popups payload', parsed);
            return parsed;
        } catch (error) {
            this.log('Error fetching popups', error);
            return [];
        }
    }

    /** Envía los atributos de contact a la API (`POST /sdk/popups/contact`). */
    private async postContact(body: { publicKey: string; userId: string; userAttributes: ContactAttributes }): Promise<void> {
        const baseUrl = this.baseUrl;
        if (!baseUrl) return;
        const endpoint = `${baseUrl}/sdk/popups/contact`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                this.log('Failed to post contact', response.status, response.statusText);
                return;
            }
            this.log('contact · sent attributes for user:', body.userId);
        } catch (error) {
            this.log('Error posting contact', error);
        }
    }

    /** Notifica eventos de popup a la API */
    private async postPopupEvent(status: POPUPSESSIONSTATUS, popupId: string, userId?: string): Promise<void> {
        const apiKey = this.config?.apiKey;
        const baseUrl = this.baseUrl;
        if (!apiKey || !baseUrl) {
            return;
        }
        const endpoint = `${baseUrl}/sdk/popups`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    publicKey: apiKey,
                    status,
                    popupId,
                    userId: userId || undefined,
                }),
            });
            if (!response.ok) {
                this.log('Failed to post popup event', response.status, response.statusText);
                return;
            }
            // Contrato Fase 1 §6: el backend devuelve el sessionId; lo cacheamos para
            // inyectarlo en las respuestas de survey (lo cose por user_id).
            try {
                const data = await response.json();
                if (data && typeof data.sessionId === 'string') {
                    this.tracking?.setSessionId(data.sessionId);
                    this.log('tracking · session_id from backend:', data.sessionId);
                }
            } catch {
                // respuesta sin cuerpo JSON: nada que cachear
            }
        } catch (error) {
            this.log('Error posting popup event', error);
        }
    }

    /** Add an event listener */
    on(eventType: DeepdotsEventType, listener: EventListener): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);
    }

    /** Remove an event listener */
    off(eventType: DeepdotsEventType, listener: EventListener): void {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /** Setup popup container element */
    private setupPopupContainer(): void {
        if (typeof document === 'undefined') {
            return;
        }
        this.popupContainer = document.createElement('div');
        this.popupContainer.id = 'deepdots-popup-container';
        this.popupContainer.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: none;
          z-index: 999999;
          background: rgba(0, 0, 0, 0.5);
          justify-content: center;
          align-items: center;
        `;
        document.body.appendChild(this.popupContainer);
    }

    /** Render the popup UI */
    private renderPopup(surveyId: string, productId: string, actions?: PopupActions, style?: PopupStyle, title?: string): void {
        const userId = this.tracking?.getUserId() ?? this.config?.userId;
        const sessionId = this.tracking?.getSessionId() ?? undefined;
        const miniService = this.analytics?.getMiniService() ?? undefined;
        const analyticsFeedbackSessionId = this.analyticsFeedbackSessionId;
        this.log('tracking · survey identity →', { userId: userId ?? null, sessionId: sessionId ?? null, miniService: miniService ?? null, analyticsFeedbackSessionId: analyticsFeedbackSessionId ?? null });
        if (this.renderer) {
            this.renderer.show(
                surveyId,
                productId,
                actions,
                (type, id, payload) => this.emitEvent(type, id, payload),
                () => this.hidePopup(),
                this.env,
                userId,
                style,
                sessionId,
                miniService,
                analyticsFeedbackSessionId,
                this.renderChrome,
                { title, showProgressBar: this.showProgressBar, surveyCss: this.surveyCss },
            );
            return;
        }

        if (!this.popupContainer) return;
        const container = this.popupContainer;
        void import('../ui/renderPopup').then(({ renderPopup }) => {
            renderPopup(
                container,
                surveyId,
                productId,
                actions,
                (type, id, payload) => this.emitEvent(type, id, payload),
                () => this.hidePopup(),
                this.env,
                userId,
                style,
                sessionId,
                miniService,
                analyticsFeedbackSessionId,
                { title, showProgressBar: this.showProgressBar, surveyCss: this.surveyCss },
            );
        });
    }

    /** Hide the popup */
    private hidePopup(): void {
        if (this.renderer) {
            this.renderer.hide();
            return;
        }
        if (this.popupContainer) {
            this.popupContainer.style.display = 'none';
            this.popupContainer.innerHTML = '';
        }
    }

    /** Emit an event */
    private emitEvent(type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>): void {
        const event: DeepdotsEvent = { type, surveyId, timestamp: Date.now(), data };
        this.log('Event emitted', event);

        const isPartialClick = type === 'popup_clicked' && data?.action === 'partial';
        if (isPartialClick) {
            this.markSurveyProgress(surveyId, 'PARTIAL');
        }
        if (type === 'survey_completed') {
            this.markSurveyAnswered(surveyId);
        }
        if (type === 'popup_shown' || type === 'survey_completed' || isPartialClick) {
            const popupIdFromData = data?.popupId as string | undefined;
            const popupId = popupIdFromData || this.surveyToPopupId.get(surveyId);
            if (popupId) {
                const userIdFromData = data?.userId as string | undefined;
                const status = type === 'popup_shown'
                    ? POPUPSESSIONSTATUS.SHOWED
                    : type === 'survey_completed'
                        ? POPUPSESSIONSTATUS.COMPLETED
                        : POPUPSESSIONSTATUS.PARTIAL;
                void this.postPopupEvent(status, popupId, userIdFromData || this.tracking?.getUserId() || this.config?.userId);
            } else {
                this.debug('No popupId available to post event', { type, surveyId });
            }
        }

        const listeners = this.listeners.get(type);
        if (listeners) {
            listeners.forEach((listener) => {
                try {
                    listener(event);
                } catch (error) {
                    if (this.logger.error) this.logger.error('Error in event listener:', error);
                    else this.logger.log('Error in event listener:', error);
                }
            });
        }
    }

    /** Log debug messages */
    private log(...args: unknown[]): void {
        if (this.config?.debug) {
            this.logger.log('[DeepdotsPopups]', ...args);
        }
    }

    /** External debug method for triggers */
    public debug(...args: unknown[]): void {
        this.log(...args);
    }

    /** Set a custom renderer */
    public setRenderer(renderer: PopupRenderer): void {
        this.renderer = renderer;
        if (this.initialized && this.renderer.init) {
            this.renderer.init();
        }
    }

    private normalizeUrl(value: string): string {
        if (!value) return '';
        const withoutIndex = value.replace(/\/index\.html(?=($|[?#]))/i, '');
        return withoutIndex.length > 1 && withoutIndex.endsWith('/') ? withoutIndex.slice(0, -1) : withoutIndex;
    }

    private safeParseUrl(url: string): URL | null {
        if (!url) return null;
        try {
            return new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
        } catch {
            return null;
        }
    }

    private mapPopupTriggerType(type: PopupTrigger['type']): TriggerConfig['type'] | null {
        switch (type) {
            case 'time_on_page':
                return 'time';
            case 'scroll':
                return 'scroll';
            case 'exit':
                return 'exit';
            case 'click':
                return 'click';
            case 'event':
                return 'event';
            default:
                return null;
        }
    }

    private markSurveyProgress(surveyId: string, status: PopupTriggerConditionStatus): void {
        const current = this.surveyProgress.get(surveyId);
        if (current?.status === 'COMPLETED' && status !== 'COMPLETED') {
            return;
        }
        this.surveyProgress.set(surveyId, { status, timestamp: Date.now() });
    }

    private isPopupDefinition(value: unknown): value is NormalizedPopupDefinition {
        if (typeof value !== 'object' || value === null) return false;
        const popup = value as Partial<NormalizedPopupDefinition>;

        return typeof popup.id === 'string'
            && typeof popup.title === 'string'
            && typeof popup.message === 'string'
            && typeof popup.surveyId === 'string'
            && typeof popup.productId === 'string'
            && Array.isArray(popup.triggers)
            && popup.triggers.length > 0
            && popup.triggers.every((trigger) => this.isPopupTrigger(trigger))
            && (!popup.cooldown || popup.cooldown.every((condition) => this.isPopupTriggerCondition(condition)));
    }

    private isPopupTrigger(value: unknown): value is PopupTrigger {
        if (typeof value !== 'object' || value === null) return false;
        const trigger = value as Partial<PopupTrigger>;
        return this.isPopupTriggerType(trigger.type)
            && (typeof trigger.value === 'number' || typeof trigger.value === 'string');
    }

    private isPopupTriggerType(value: unknown): value is PopupTrigger['type'] {
        return value === 'time_on_page'
            || value === 'scroll'
            || value === 'exit'
            || value === 'click'
            || value === 'event';
    }

    private isPopupTriggerCondition(value: unknown): value is PopupTriggerCondition {
        if (typeof value !== 'object' || value === null) return false;
        const condition = value as Partial<PopupTriggerCondition>;
        return POPUP_TRIGGER_CONDITION_STATUSES.includes(condition.answered as PopupTriggerConditionStatus)
            && typeof condition.cooldownDays === 'number'
            && Number.isFinite(condition.cooldownDays)
            && condition.cooldownDays >= 0;
    }

    private isLegacyPopupTriggerCondition(value: unknown): value is LegacyPopupTriggerCondition {
        if (typeof value !== 'object' || value === null) return false;
        const condition = value as Partial<LegacyPopupTriggerCondition>;
        if (condition.answered !== undefined && typeof condition.answered !== 'boolean') {
            return false;
        }
        if (condition.cooldownDays !== undefined) {
            return typeof condition.cooldownDays === 'number'
                && Number.isFinite(condition.cooldownDays)
                && condition.cooldownDays >= 0;
        }
        return true;
    }

    private normalizeTriggers(value: unknown): PopupTrigger[] {
        const items = Array.isArray(value) ? value : value ? [value] : [];
        return items
            .filter((trigger): trigger is PopupTrigger => this.isPopupTrigger(trigger))
            .map((trigger) => ({
                type: trigger.type,
                value: trigger.value,
            }));
    }

    private normalizeCooldown(value: unknown): PopupTriggerCondition[] {
        if (!Array.isArray(value)) return [];
        return value.filter((condition): condition is PopupTriggerCondition => this.isPopupTriggerCondition(condition));
    }

    private normalizeLegacyConditions(value: unknown): LegacyPopupTriggerCondition[] {
        if (!Array.isArray(value)) return [];
        return value.filter((condition): condition is LegacyPopupTriggerCondition => this.isLegacyPopupTriggerCondition(condition));
    }

    private normalizePopupDefinition(def: unknown): NormalizedPopupDefinition | null {
        if (typeof def !== 'object' || def === null) return null;
        const raw = def as Partial<PopupDefinition> & {
            trigger?: PopupTrigger | PopupTrigger[];
            triggers?: PopupTrigger | PopupTrigger[];
            conditions?: LegacyPopupTriggerCondition[];
            cooldown?: PopupTriggerCondition[];
        };

        const rawTriggers = raw.triggers ?? raw.trigger;
        const triggers = this.normalizeTriggers(rawTriggers);
        if (!triggers.length) return null;

        const rawTriggerList = Array.isArray(rawTriggers) ? rawTriggers : rawTriggers ? [rawTriggers] : [];
        const legacyConditions = [
            ...this.normalizeLegacyConditions(raw.conditions),
            ...rawTriggerList.flatMap((trigger) => this.normalizeLegacyConditions((trigger as { condition?: unknown }).condition)),
        ];
        const cooldown = this.normalizeCooldown(raw.cooldown);

        return {
            ...(raw as PopupDefinition),
            triggers,
            cooldown,
            legacyConditions,
        };
    }

    private validatePopupDefinitions(defs: unknown[]): NormalizedPopupDefinition[] {
        return defs
            .map((def) => this.normalizePopupDefinition(def))
            .filter((def): def is NormalizedPopupDefinition => !!def && this.isPopupDefinition(def));
    }
}
