/**
 * Configuration options for initializing the DeepdotsPopups SDK
 */
export interface DeepdotsConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API */
  baseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
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
