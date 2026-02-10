import {
    DeepdotsConfig,
    TriggerConfig,
    DeepdotsEvent,
    DeepdotsEventType,
    EventListener, DeepdotsInitParams, PopupDefinition, PopupTriggerCondition, PopupActions
} from '../types';
import {renderPopup} from '../ui/renderPopup';
import {setupTrigger} from '../triggers';
import {resolveEnvironment} from '../config/env';
import {PopupRenderer, createDefaultRenderer} from '../platform/renderer';

/**
 * Main class for managing survey popups
 */
export class DeepdotsPopups {
    private config: DeepdotsConfig | null = null;
    private listeners: Map<DeepdotsEventType, Set<EventListener>> = new Map();
    private triggers: TriggerConfig[] = [];
    private initialized = false;
    private renderer: PopupRenderer = createDefaultRenderer();
    private popupContainer: HTMLElement | null = null; // deprecated: mantenido para compatibilidad interna
    private popupDefinitions: PopupDefinition[] = [];
    private popupsLoaded = false;
    private pendingAutoLaunch = false;

    private answeredSurveys: Set<string> = new Set();
    private lastShown: Map<string, number> = new Map(); // popupId -> timestamp mostrado
    private surveyToPopupId: Map<string, string> = new Map(); // surveyId -> popupId

    private baseUrl: string = '';
    private env: 'production' | 'development' = 'production';

    /** Initialize the SDK with configuration */
    init(config: DeepdotsInitParams): void {
        if (this.initialized) {
            this.log('SDK already initialized');
            return;
        }

        const env = resolveEnvironment(config.nodeEnv);

        this.baseUrl = env.apiBaseUrl;
        this.env = config.nodeEnv || 'production';

        this.config = {
            apiKey: config.apiKey || undefined,
            mode: config.mode || 'client',
            debug: config.debug || false,
            popups: config.popups || [],
            userId: config.userId || undefined,
        } as DeepdotsConfig;

        this.initialized = true;
        this.log('SDK initialized', this.config);
        // sustituimos setupPopupContainer por init del renderer
        if (this.renderer.init) this.renderer.init();
        this.setupPopupContainer(); // mantener por ahora para tests que acceden directamente al DOM

        // Carga de popups según modo
        if (this.config.mode === 'client') {
            this.popupDefinitions = this.config.popups || [];
            this.popupsLoaded = true;
            this.configureTriggersFromDefinitions();
        } else {
            // Modo server: simulamos fetch
            this.fetchPopupsFromServer().then(defs => {
                this.popupDefinitions = defs;
                this.popupsLoaded = true;
                this.log('Popups loaded from server (fake)', defs);
                this.configureTriggersFromDefinitions();
                if (this.pendingAutoLaunch) {
                    this.startTriggers();
                }
            });
        }
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

    /** Show a popup immediately (supports legacy ShowOptions and new PopupDefinition) */
    show(options: PopupDefinition | { surveyId: string; productId: string; data?: Record<string, unknown> }): void {
        console.log('Show popup called with options:', options);
        if (!this.initialized) {
            throw new Error('SDK not initialized. Call init() first.');
        }
        // Detectar tipo
        const isDefinition = (options as PopupDefinition).id !== undefined;
        if (isDefinition) {
            const def = options as PopupDefinition;
            this.log('Showing popup (definition)', def);
            this.surveyToPopupId.set(def.surveyId, def.id);
            this.renderPopup(def.surveyId, def.productId, def.actions);
            this.emitEvent('popup_shown', def.surveyId, {popupId: def.id});
        } else {
            const opt = options as { surveyId: string; productId: string; data?: Record<string, unknown> };
            this.log('Showing popup (legacy options)', opt);
            this.renderPopup(opt.surveyId, opt.productId, undefined);
            this.emitEvent('popup_shown', opt.surveyId);
        }
    }

    /** Mostrar popup por id de definición (usa surveyId interno) */
    showByPopupId(popupId: string): void {
        const def = this.popupDefinitions.find(p => p.id === popupId);
        if (!def) {
            this.log('Popup definition not found', popupId);
            return;
        }
        this.show(def);
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
        const validDefs = this.validatePopupDefinitions(this.popupDefinitions);
        console.log('validDefs', validDefs);
        validDefs.forEach(def => {
            if (!def.triggers) return;
            const t = def.triggers;
            let type: TriggerConfig['type'];
            switch (t.type) {
                case 'time_on_page':
                    type = 'time';
                    break;
                case 'scroll':
                    type = 'scroll';
                    break;
                case 'exit':
                    type = 'exit';
                    break;
                case 'click':
                    type = 'click';
                    break;
                default:
                    this.debug('Unsupported trigger type', t.type);
                    return;
            }
            const value = type === 'time' && typeof t.value === 'number' ? (t.value * 1000) : t.value;
            derived.push({type, value, surveyId: def.surveyId});
        });
        if (derived.length) {
            this.configureTriggers(derived);
        }
    }

    /** Lógica para evaluar condiciones antes de mostrar una encuesta */
    triggerSurvey(surveyId: string): void {
        // Encontrar popup por surveyId
        const def = this.popupDefinitions.find(p => p.surveyId === surveyId);
        if (!def) {
            this.debug('No popup definition for surveyId', surveyId);
            return;
        }
        if (!this.shouldShow(def)) {
            this.debug('Conditions prevented showing popup', def.id);
            return;
        }
        this.show(def);
        this.lastShown.set(def.id, Date.now());
    }

    private shouldShow(def: PopupDefinition): boolean {
        if (!this.matchesSegmentsPath(def)) {
            return false;
        }
        // Evaluar condiciones del trigger
        const conditions = def.triggers.condition || [];
        if (!conditions.length) return true;
        return conditions.every(c => this.evaluateCondition(def, c));
    }

    private matchesSegmentsPath(def: PopupDefinition): boolean {
        const paths = def.segments?.path;
        if (!paths || paths.length === 0) return true;
        if (typeof window === 'undefined' || !window.location) {
            this.debug('No window.location available for path comparison', {popupId: def.id, paths});
            return true;
        }

        const currentPath = window.location.pathname || '';
        const currentHref = window.location.href || '';

        const normalize = (value: string): string => {
            if (value.length > 1 && value.endsWith('/')) return value.slice(0, -1);
            return value;
        };

        const normalizedPath = normalize(currentPath);
        const normalizedHref = normalize(currentHref);

        const matches = paths.some(rawCandidate => {
            const candidate = normalize(rawCandidate);
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
            this.debug('No path match for popup', {popupId: def.id, paths, currentPath: normalizedPath});
        }

        return matches;
    }

    private evaluateCondition(def: PopupDefinition, condition: PopupTriggerCondition): boolean {
        if (!condition.answered && this.answeredSurveys.has(def.surveyId)) {
            return false;
        }
        // cooldownDays: no mostrar si se mostró hace menos de cooldownDays días
        if (condition.cooldownDays) {
            const last = this.lastShown.get(def.id);
            if (last) {
                const msSince = Date.now() - last;
                const required = condition.cooldownDays * 24 * 60 * 60 * 1000;
                if (msSince < required) return false;
            }
        }
        return true;
    }

    /** Marcar encuesta como contestada externamente */
    public markSurveyAnswered(surveyId: string): void {
        this.answeredSurveys.add(surveyId);
    }

    /** Fetch al servidor para obtener popups */
    private async fetchPopupsFromServer(): Promise<PopupDefinition[]> {
        const apiKey = this.config?.apiKey;
        const baseUrl = this.baseUrl;
        if (!apiKey || !baseUrl) {
            this.log('Missing apiKey or baseUrl. Skipping popups fetch.');
            return [];
        }
        const endpoint = `${baseUrl}/sdk/${encodeURIComponent(apiKey)}/popups`;
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
            console.log('res: ', parsed, this.validatePopupDefinitions(parsed))
            return parsed;
        } catch (error) {
            this.log('Error fetching popups', error);
            return [];
        }
    }

    /** Notifica eventos de popup a la API */
    private async postPopupEvent(status: 'opened' | 'completed', popupId: string, userId?: string): Promise<void> {
        const apiKey = this.config?.apiKey;
        const baseUrl = this.baseUrl;
        if (!apiKey || !baseUrl) {
            return;
        }
        const endpoint = `${baseUrl}/sdk/popups`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    publicKey: apiKey,
                    status,
                    popupId,
                    userId: userId || undefined,
                }),
            });
            if (!response.ok) {
                this.log('Failed to post popup event', response.status, response.statusText);
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
    private renderPopup(surveyId: string, productId: string, actions?: PopupActions): void {
        // Nuevo camino: usar renderer
        if (this.renderer) {
            this.renderer.show(
                surveyId,
                productId,
                actions, (type, id, payload) => this.emitEvent(type, id, payload),
                () => this.hidePopup(),
                this.env
            );
            return;
        }
        // Fallback legacy
        if (!this.popupContainer) return;
        renderPopup(
            this.popupContainer,
            surveyId, productId,
            actions, (type, id, payload) => this.emitEvent(type, id, payload),
            () => this.hidePopup(),
            this.env
        );
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
        const event: DeepdotsEvent = {type, surveyId, timestamp: Date.now(), data};
        this.log('Event emitted', event);
        if (type === 'survey_completed') {
            this.markSurveyAnswered(surveyId);
        }
        if (type === 'popup_shown' || type === 'survey_completed') {
            const popupIdFromData = data?.popupId as string | undefined;
            const popupId = popupIdFromData || this.surveyToPopupId.get(surveyId);
            if (popupId) {
                const userIdFromData = data?.userId as string | undefined;
                void this.postPopupEvent(type === 'popup_shown' ? 'opened' : 'completed', popupId, userIdFromData || this.config?.userId);
            } else {
                this.debug('No popupId available to post event', {type, surveyId});
            }
        }
        const listeners = this.listeners.get(type);
        if (listeners) {
            listeners.forEach((listener) => {
                try {
                    listener(event);
                } catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
    }

    /** Log debug messages */
    private log(...args: unknown[]): void {
        if (this.config?.debug) {
            console.log('[DeepdotsPopups]', ...args);
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

    // Type guards
    private isPopupDefinition(value: unknown): value is PopupDefinition {
        if (typeof value !== 'object' || value === null) return false;
        const v = value as Partial<PopupDefinition> & {
            triggers?: PopupDefinition['triggers'];
            conditions?: PopupTriggerCondition[];
        };

        const trigger = v.triggers || v.triggers;
        if (!trigger) return false;

        return typeof v.id === 'string'
            && typeof v.title === 'string'
            && typeof v.message === 'string'
            && typeof v.surveyId === 'string'
            && typeof v.productId === 'string';
    }

    private normalizePopupDefinition(def: unknown): PopupDefinition | null {
        if (typeof def !== 'object' || def === null) return null;
        const raw = def as Partial<PopupDefinition> & {
            triggers?: PopupDefinition['triggers'];
            conditions?: PopupTriggerCondition[];
        };

        const trigger = raw.triggers || raw.triggers;
        if (!trigger) return null;

        const condition = trigger.condition ?? raw.conditions ?? [];

        return {
            ...(raw as PopupDefinition),
            triggers: {
                ...trigger,
                condition,
            },
        } as PopupDefinition;
    }

    private validatePopupDefinitions(defs: unknown[]): PopupDefinition[] {
        return defs
            .map(def => this.normalizePopupDefinition(def))
            .filter((def): def is PopupDefinition => !!def && this.isPopupDefinition(def));
    }
}
