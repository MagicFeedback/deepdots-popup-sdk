export { DeepdotsPopups } from './core/deepdots-popups';
export { buildMessageParams } from './analytics/messaging';
export type { MessageStage, TrackMessageOptions } from './analytics/messaging';
export type {
  DeepdotsConfig,
  TriggerConfig,
  DeepdotsEvent,
  DeepdotsEventType,
  EventListener,
  PopupDefinition,
  PopupTrigger,
  PopupTriggerCondition,
  PopupTriggerConditionStatus,
} from './types';
export { POPUP_TRIGGER_CONDITION_STATUSES } from './types';
export { NoopPopupRenderer, BrowserPopupRenderer, createDefaultRenderer } from './platform/renderer';
export type { PopupRenderer } from './platform/renderer';
// Para hosts (React Native): inyectar storage persistente y device info.
export { InMemoryStorage } from './tracking/tracking-manager';
export type { KeyValueStorage } from './tracking/tracking-manager';
export type { DeviceInfo } from './analytics/device-info';
export { ContactManager } from './contact/contact-manager';
export type { ContactAttributes, ContactAttributeValue, ContactBody } from './contact/contact-manager';
// Canal de analytics → POST /sdk/feedback (modelo de Feedback del Surveys SDK).
export { buildAnalyticsFeedbackBody, createFeedbackSink } from './analytics/feedback-payload';
export type { AnalyticsKeys, AnalyticsFeedbackBody, FeedbackKV } from './analytics/feedback-payload';
// Crash & error reporting (#14–17).
export { CrashReporter, crashRecordToParams } from './analytics/crash-reporter';
export type { CrashRecord, CrashSeverity, ReportErrorOptions, DeviceSnapshot, ReactNativeErrorUtils } from './analytics/crash-reporter';
// React Native: renderer-puente para mostrar surveys en react-native-webview.
export { ReactNativePopupRenderer } from './platform/react-native-renderer';
export type { ReactNativeRendererOptions, ReactNativeSurveyPayload } from './platform/react-native-renderer';
export { buildSurveyHtml } from './ui/surveyHtml';
// React Native: auto-wiring en una llamada (storage MMKV + device + platform + lifecycle).
export { setupReactNative, mmkvStorage, collectRnDevice } from './react-native/setup';
export type { ReactNativeSetupDeps, MmkvLike, DeviceInfoLike, AppStateLike } from './react-native/setup';
