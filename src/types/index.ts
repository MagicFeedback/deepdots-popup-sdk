/**
 * Configuration options for initializing the DeepdotsPopups SDK
 */
import type { KeyValueStorage } from '../tracking/tracking-manager';
import type { DeviceInfo } from '../analytics/device-info';
import type { AnalyticsKeys } from '../analytics/feedback-payload';

/**
 * Custom logger to receive the SDK's debug output instead of the console.
 * Only `log` is required; `warn`/`error`/`info` fall back to `log` when omitted.
 * Lets the host pipe debug output to a file, Firebase, etc. `console` satisfies this shape.
 */
export interface DeepdotsLogger {
    log: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
}

export interface DeepdotsInitParams {
    /** API key for authentication */
    apiKey?: string;
    /** Node environment: 'development' or 'production' */
    nodeEnv?: 'development' | 'production';
    /** Enable debug logging */
    debug?: boolean;
    /** Custom logger for debug output. When set (and `debug` is true), the SDK routes its logs here instead of `console`. Default: `console`. */
    logger?: DeepdotsLogger;
    /** Optional user id to send with popup events */
    userId?: string;
    /** Starts tracking enabled (default) or disabled (e.g. until consent is granted). Equivalent to calling `setTrackingEnabled` after init. */
    trackingEnabled?: boolean;
    /** Host app version (for analytics device info / Technology #11). */
    appVersion?: string;
    /** Injectable persistent storage (RN: adapter over AsyncStorage). If missing, uses localStorage/in-memory. */
    storage?: KeyValueStorage;
    /** Platform used in the analytics envelope. Default is 'web'; in RN pass 'android'/'ios'. */
    platform?: 'web' | 'android' | 'ios';
    /** Injectable device info (RN: from react-native-device-info). If missing, it is derived from the browser. */
    device?: DeviceInfo;
    /**
     * Analytics channel keys (`POST /sdk/feedback`). If provided, analytics is SENT
     * to the configured integration; if missing, it stays in dry-run mode (console.log only).
     */
    analytics?: AnalyticsKeys;
    /**
     * Internal user attributes known only by the host (language, age, plan, ...), sent
     * to the backend Contact for segmentation/targeting. Requires `userId`. Equivalent to calling
     * `setContactAttributes` after init (sends only when values changed from the last sync).
     */
    contactAttributes?: Record<string, string | number | boolean>;

}
export interface DeepdotsConfig {
    /** API key for authentication */
    apiKey?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Optional user id to send with popup events */
    userId?: string;
}

/**
 * Options for configuring survey triggers
 */
export interface TriggerConfig {
    /** Trigger type: 'time' (delay), 'scroll' (scroll percentage), 'exit' (route exit), 'click' (element id), 'event' (host event) */
    type: 'time' | 'scroll' | 'exit' | 'click' | 'event';
    /** Value for the trigger (milliseconds for time, percentage for scroll, seconds for exit, element id for click, event name for event) */
    value?: number | string;
    /** Survey ID to show when triggered */
    surveyId: string;
    /** Optional popup definition id (used to disambiguate repeated survey ids) */
    popupId?: string;
}

/**
 * Event types emitted by the SDK
 */
export type DeepdotsEventType =
    | 'popup_shown'
    | 'popup_clicked'
    | 'survey_completed';

/**
 * Event payload structure
 */
export interface DeepdotsEvent {
    type: DeepdotsEventType;
    surveyId: string;
    timestamp: number;
    data?: Record<string, unknown>;
}

/**
 * Event listener callback
 */
export type EventListener = (event: DeepdotsEvent) => void;

/** Trigger type used by remote popup definitions */
export type PopupTriggerType = 'time_on_page' | 'scroll' | 'exit' | 'click' | 'event';

export type PopupTriggerConditionStatus = 'SHOWED' | 'PARTIAL' | 'COMPLETED';

export const POPUP_TRIGGER_CONDITION_STATUSES: PopupTriggerConditionStatus[] = [
    'SHOWED',
    'PARTIAL',
    'COMPLETED',
];

/** Extra condition used to activate the popup */
export interface PopupTriggerCondition {
    answered: PopupTriggerConditionStatus; // user progress status in the survey
    cooldownDays: number; // cooldown days before showing again
}

/** Trigger attached to the popup definition */
export interface PopupTrigger {
    type: PopupTriggerType;
    value: number | string; // seconds on page, scroll percentage, click id, or event name
}

/** Accept action (open survey) */
export interface PopupActionAccept {
    label: string;
    surveyId: string; // survey id to launch
}

/** Decline action */
export interface PopupActionDecline {
    label: string;
    cooldownDays?: number; // optional: do not show again until X days pass
}

/** Start Surveys Action */
export interface PopupActionStart {
    label: string;
}

/** Complete action (accept and auto-complete survey) */
// Requires the survey to support auto-completion via parameters.
export interface PopupActionComplete {
    label: string;
    surveyId: string; // survey id to launch
    autoCompleteParams: Record<string, unknown>; // parameters used for auto-completion
    cooldownDays?: number;
}

/** Set of actions available in the popup */
export interface PopupActions {
    accept?: PopupActionAccept;
    decline?: PopupActionDecline;
    complete?: PopupActionComplete;
    start?: PopupActionStart;
    back?: PopupActionDecline;
}

/** Fuente personalizable del popup + survey (viene de la API por popup) */
export interface PopupFont {
    /** Nombre de la familia. Ej: "Inter" (nombre limpio, NO un stack). */
    family: string;
    /** Opcional: URL a un archivo de fuente (woff2/ttf/otf) para armar un @font-face. */
    url?: string;
}

/** Configurable popup styles */
export interface PopupStyle {
    theme: 'light' | 'dark';
    position: 'bottom' | 'bottom-right' | 'bottom-left' | 'top' | 'top-right' | 'top-left' | 'center';
    /** @deprecated Not used by the SDK; kept only for API compatibility */
    imageUrl?: string | null;
    /** Fuente personalizada. Si falta, se mantiene el comportamiento actual. */
    font?: PopupFont;
}

/** Segments/targeting rules for showing the popup */
export interface PopupSegments {
    lang?: string[]; // allowed languages
    path?: string[]; // app routes where it can be shown
    [key: string]: unknown; // possible future extension
}

/** Full popup definition */
export interface PopupDefinition {
    id: string;
    title: string;
    message: string; // rendered safe HTML (recommended to sanitize upstream)
    triggers: PopupTrigger[];
    cooldown?: PopupTriggerCondition[];
    actions?: PopupActions;
    surveyId: string;
    productId: string;
    style?: PopupStyle;
    segments?: PopupSegments;
}

export interface FormStyle
{
    id: string;
    logo: string;
    title: string;
    companyName: string;
    backgroundColor: string;
    boxBackgroundColor: string;
    buttonOnTopColor: string;
    buttonPrimaryColor: string
    buttonSecondaryColor: string;
    loadingBarColor: string;
    favIcon: string;
    startMessage: string;
    successMessage: string;
    addLogoInMsg: boolean;
    privacyPolicyUrl: string;
    helpUrl: string;
    integrationId: string;
    redirectLink: string;
    redirectError: string;
    redirectTime: number;
    integrationThemeId: string;
    contentAlign: 'top' | 'center';
    logoSize: 'small' | 'medium' | 'large';
    logoPosition: 'left' | 'right' | 'center';
    showProgressBar: boolean;
    showProgressUnit: boolean;
    progressUnit: 'percentage' | 'fraction';
}


export interface FormData {
    id: string;
    name: string;
    description: string;
    type: string;
    identity: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    externalId?: string | null;
    companyId: string;
    productId: string;
    userId: string;
    style: FormStyle
}

export enum POPUPSESSIONSTATUS {
    NONE = "NONE",
    SHOWED = "SHOWED",
    PARTIAL = "PARTIAL",
    COMPLETED = "COMPLETED",
    DEPRECATED = "DEPRECATED",
}
