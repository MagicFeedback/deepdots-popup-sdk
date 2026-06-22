export { DeepdotsPopups } from './core/deepdots-popups';
export type {
  DeepdotsConfig,
  TriggerConfig,
  ShowOptions,
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
// React Native: renderer-puente para mostrar surveys en react-native-webview.
export { ReactNativePopupRenderer } from './platform/react-native-renderer';
export type { ReactNativeRendererOptions, ReactNativeSurveyPayload } from './platform/react-native-renderer';
export { buildSurveyHtml } from './ui/surveyHtml';
// React Native: auto-wiring en una llamada (storage MMKV + device + platform + lifecycle).
export { setupReactNative, mmkvStorage, collectRnDevice } from './react-native/setup';
export type { ReactNativeSetupDeps, MmkvLike, DeviceInfoLike, AppStateLike } from './react-native/setup';
