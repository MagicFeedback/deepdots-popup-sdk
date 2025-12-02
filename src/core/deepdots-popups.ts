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
import { PopupRenderer, createDefaultRenderer } from '../platform/renderer';

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

    /** Initialize the SDK with configuration */
    init(config: DeepdotsInitParams): void {
        if (this.initialized) {
            this.log('SDK already initialized');
            return;
        }

        const env = resolveEnvironment(config.nodeEnv);

        this.config = {
            apiKey: config.apiKey || undefined,
            baseUrl: env.apiBaseUrl,
            mode: config.mode || 'client',
            debug: config.debug || false,
            popups: config.popups || [],
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
            this.renderPopup(def.surveyId, def.productId, def.actions);
            this.emitEvent('popup_shown', def.surveyId);
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
        validDefs.forEach(def => {
            if (!def.trigger) return;
            const t = def.trigger;
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
                default:
                    this.debug('Unsupported trigger type', t.type);
                    return;
            }
            const value = type === 'time' ? (t.value * 1000) : t.value;
            derived.push({ type, value, surveyId: def.surveyId });
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
        // Evaluar condiciones del trigger
        const conditions = def.trigger.condition || [];
        if (!conditions.length) return true;
        return conditions.every(c => this.evaluateCondition(def, c));
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

    /** Simula fetch al servidor para obtener popups */
    private async fetchPopupsFromServer(): Promise<PopupDefinition[]> {
        // Simulación: red 50ms
        await new Promise(res => setTimeout(res, 50));
        return this.generateFakePopups();
    }

    /** Genera datos fake para pruebas en modo server */
    private generateFakePopups(): PopupDefinition[] {
        return [
            {
                id: 'popup-123',
                title: 'Would you like to help us improve?',
                message: '<p>Take a quick survey and share your thoughts.</p>',
                trigger: { type: 'time_on_page', value: 1, condition: [{ answered: false, cooldownDays: 7 }] },
                actions: {
                    accept: { label: 'Take Survey', surveyId: 'survey-abc' },
                    decline: { label: 'Not Now', cooldownDays: 7 }
                },
                surveyId: 'survey-abc',
                productId: 'product-xyz',
                style: { theme: 'light', position: 'bottom-right', imageUrl: null },
                segments: { lang: ['en'], path: ['/checkout'] }
            }
        ];
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
            this.renderer.show(surveyId, productId, actions, (type, id, payload) => this.emitEvent(type, id, payload), () => this.hidePopup());
            return;
        }
        // Fallback legacy
        if (!this.popupContainer) return;
        renderPopup(this.popupContainer, surveyId,productId, actions, (type, id, payload) => this.emitEvent(type, id, payload), () => this.hidePopup());
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
        const v = value as Partial<PopupDefinition>;
        return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.message === 'string' && typeof v.surveyId === 'string' && typeof v.productId === 'string' && !!v.trigger; // removed redundant typeof v.trigger.type
    }

    private validatePopupDefinitions(defs: unknown[]): PopupDefinition[] {
        return defs.filter(d => this.isPopupDefinition(d)) as PopupDefinition[];
    }
}
