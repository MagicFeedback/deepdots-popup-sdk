/**
 * Configuration options for initializing the DeepdotsPopups SDK
 */

export interface DeepdotsInitParams {
    /** API key for authentication */
    apiKey?: string;
    /** Node environment: 'development' or 'production' */
    nodeEnv?: 'development' | 'production';
    /** Execution mode: 'server' or 'client' */
    mode?: 'server' | 'client';
    /** Enable debug logging */
    debug?: boolean;
    /** Lista de definiciones de popups precargadas */
    popups?: PopupDefinition[];

}
export interface DeepdotsConfig {
    /** API key for authentication */
    apiKey?: string;
    /** Base url to contact with the api */
    baseUrl?: string;
    /** Execution mode: 'server' or 'client' */
    mode?: 'server' | 'client';
    /** Enable debug logging */
    debug?: boolean;
    /** Lista de definiciones de popups precargadas */
    popups?: PopupDefinition[];
}

/**
 * Options for configuring survey triggers
 */
export interface TriggerConfig {
    /** Trigger type: 'time' (delay), 'scroll' (scroll percentage), 'exit' (exit intent) */
    type: 'time' | 'scroll' | 'exit';
    /** Value for the trigger (milliseconds for time, percentage for scroll) */
    value?: number;
    /** Survey ID to show when triggered */
    surveyId: string;
}

/**
 * Options for showing a popup
 */
export interface ShowOptions {
    /** Survey ID to display */
    surveyId: string;
    /** Product ID associated with the survey */
    productId: string;
    /** Additional data to pass with the survey */
    data?: Record<string, unknown>;
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

/** Tipo de trigger específico para definiciones de popup remotas */
export type PopupTriggerType = 'time_on_page' | 'scroll' | 'exit';

/** Condición adicional para la activación del popup */
export interface PopupTriggerCondition {
    answered: boolean; // si el usuario ya contestó la encuesta
    cooldownDays: number; // días de enfriamiento antes de mostrar de nuevo
}

/** Trigger asociado a la definición del popup */
export interface PopupTrigger {
    type: PopupTriggerType;
    value: number; // segundos en página para time_on_page o porcentaje scroll
    condition?: PopupTriggerCondition[]; // lista de condiciones compuestas
}

/** Acción de aceptar (abrir encuesta) */
export interface PopupActionAccept {
    label: string;
    surveyId: string; // id de la encuesta a lanzar
}

/** Acción de declinar */
export interface PopupActionDecline {
    label: string;
    cooldownDays?: number; // opcional: no mostrar hasta pasado X días
}

/** Start Surveys Action */
export interface PopupActionStart {
    label: string;
}

/** Acción de completar (aceptar y completar encuesta automáticamente) */
// Requiere que la encuesta soporte auto-completado vía parámetros
export interface PopupActionComplete {
    label: string;
    surveyId: string; // id de la encuesta a lanzar
    autoCompleteParams: Record<string, unknown>; // parámetros para auto-completar
    cooldownDays?: number;
}

/** Conjunto de acciones disponibles en el popup */
export interface PopupActions {
    accept?: PopupActionAccept;
    decline?: PopupActionDecline;
    complete?: PopupActionComplete;
    start?: PopupActionStart;
    back?: PopupActionDecline;
}

/** Estilos configurables del popup */
export interface PopupStyle {
    theme: 'light' | 'dark';
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
    imageUrl: string | null;
}

/** Segmentos o targeting para mostrar el popup */
export interface PopupSegments {
    lang?: string[]; // idiomas permitidos
    path?: string[]; // rutas de la app donde se muestra
    [key: string]: unknown; // posible extensión futura
}

/** Definición completa de un popup */
export interface PopupDefinition {
    id: string;
    title: string;
    message: string; // HTML seguro renderizado (se recomienda sanitizar afuera)
    trigger: PopupTrigger;
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