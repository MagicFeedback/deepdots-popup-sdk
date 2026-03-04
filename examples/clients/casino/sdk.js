import { DeepdotsPopups } from '../../../dist/index.mjs';

const SEARCH_EVENT_NAME = 'search';
const SEARCH_WINDOW_MS = 120 * 1000;
const SEARCH_BACK_WINDOW_MS = 60 * 1000;
const SEARCH_EVENT_DEDUP_MS = 1200;

export function createCasinoSdk({ apiKey }) {
  let sdk = null;

  const searchBehavior = {
    searchTimestamps: [],
    lastSearchResultClickAt: 0,
    pendingBackAfterSearchClickAt: 0,
    lastBackAfterSearchClickAt: 0,
    lastCountedQuery: '',
    lastCountedAt: 0,
    lastEventEmitAt: 0,
  };

  function init(userId) {
    removePopupContainers();
    resetSearchBehavior();

    sdk = new DeepdotsPopups();
    sdk.init({
      mode: 'server',
      nodeEnv: 'development',
      debug: true,
      apiKey,
      userId,
    });
    sdk.autoLaunch();

    exposeDebugApi();
  }

  function handleRouteTransition(fromRoute, toRoute) {
    if (fromRoute === 'game' && toRoute === 'home' && searchBehavior.pendingBackAfterSearchClickAt) {
      searchBehavior.lastBackAfterSearchClickAt = Date.now();
      searchBehavior.pendingBackAfterSearchClickAt = 0;
    }
  }

  function registerSearchAction(query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (normalized.length < 2) {
      return;
    }

    const now = Date.now();
    if (searchBehavior.lastCountedQuery === normalized && now - searchBehavior.lastCountedAt < 1800) {
      return;
    }
    searchBehavior.lastCountedQuery = normalized;
    searchBehavior.lastCountedAt = now;

    pruneOldSearches(now);
    searchBehavior.searchTimestamps.push(now);

    const searchesInWindow = searchBehavior.searchTimestamps.length;
    const searchesSinceLastClick = searchBehavior.searchTimestamps.filter((timestamp) => {
      return timestamp > searchBehavior.lastSearchResultClickAt;
    }).length;

    const backFlowMatched =
      searchBehavior.lastBackAfterSearchClickAt > 0
      && now - searchBehavior.lastBackAfterSearchClickAt <= SEARCH_BACK_WINDOW_MS;

    if (searchesInWindow >= 3) {
      emitSearchEvent('three_searches_120s');
      return;
    }

    if (searchesSinceLastClick >= 2) {
      emitSearchEvent('two_searches_no_click');
      return;
    }

    if (backFlowMatched) {
      emitSearchEvent('search_click_back_new_search');
      searchBehavior.lastBackAfterSearchClickAt = 0;
    }
  }

  function markSearchResultClick() {
    const now = Date.now();
    searchBehavior.lastSearchResultClickAt = now;
    searchBehavior.pendingBackAfterSearchClickAt = now;
  }

  function exposeDebugApi() {
    if (typeof window === 'undefined') {
      return;
    }

    window.__casinoDemo = {
      triggerSearchEvent: () => emitSearchEvent('manual_debug'),
      triggerSdkEvent: (eventName) => triggerSdkEvent(eventName),
      getSearchState: () => ({
        ...searchBehavior,
        searchTimestamps: [...searchBehavior.searchTimestamps],
      }),
    };
  }

  function emitSearchEvent(reason) {
    if (!sdk || typeof sdk.triggerEvent !== 'function') {
      console.warn('[casino-demo] sdk.triggerEvent is not available yet');
      return;
    }

    const now = Date.now();
    if (now - searchBehavior.lastEventEmitAt < SEARCH_EVENT_DEDUP_MS) {
      return;
    }

    searchBehavior.lastEventEmitAt = now;
    console.info('[casino-demo] triggerEvent(search)', { reason });
    sdk.triggerEvent(SEARCH_EVENT_NAME);
  }

  function triggerSdkEvent(eventName) {
    if (!sdk || typeof sdk.triggerEvent !== 'function') {
      console.warn('[casino-demo] sdk.triggerEvent is not available yet');
      return;
    }

    sdk.triggerEvent(String(eventName || ''));
  }

  function pruneOldSearches(now) {
    const threshold = now - SEARCH_WINDOW_MS;
    searchBehavior.searchTimestamps = searchBehavior.searchTimestamps.filter((timestamp) => timestamp >= threshold);
  }

  function resetSearchBehavior() {
    searchBehavior.searchTimestamps = [];
    searchBehavior.lastSearchResultClickAt = 0;
    searchBehavior.pendingBackAfterSearchClickAt = 0;
    searchBehavior.lastBackAfterSearchClickAt = 0;
    searchBehavior.lastCountedQuery = '';
    searchBehavior.lastCountedAt = 0;
    searchBehavior.lastEventEmitAt = 0;
  }

  function removePopupContainers() {
    document.querySelectorAll('#deepdots-popup-container').forEach((container) => {
      container.remove();
    });
  }

  return {
    exposeDebugApi,
    handleRouteTransition,
    init,
    markSearchResultClick,
    registerSearchAction,
  };
}
