import { DeepdotsPopups } from '../../../dist/index.mjs';

const API_KEY = '6ZYgj8csaOEakUfZ2YmjgOg6CQsQLYnl';
const DEFAULT_USER_ID = 'user_search_ready';
const DEFAULT_EVENT_NAME = 'search-trigger-event-name';

const sdk = new DeepdotsPopups();

sdk.init({
  mode: 'server',
  nodeEnv: 'development',
  debug: true,
  apiKey: API_KEY,
  userId: DEFAULT_USER_ID,
});

sdk.autoLaunch();

export function triggerDemoEvent(eventName = DEFAULT_EVENT_NAME) {
  const normalizedEvent = String(eventName || '').trim();

  if (!normalizedEvent) {
    console.warn('[casino-sdk-example] Missing event name.');
    return;
  }

  sdk.triggerEvent(normalizedEvent);
}

if (typeof window !== 'undefined') {
  window.__casinoSdkTriggerExample = {
    sdk,
    triggerDemoEvent,
  };

  window.triggerCasinoSearchEvent = () => {
    triggerDemoEvent('search');
  };
}
