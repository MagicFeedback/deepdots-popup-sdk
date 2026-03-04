import { DeepdotsPopups } from '../../../dist/index.mjs';

const SEARCH_EVENT_NAME = 'search';
const GENERAL_SURVEY_EVENT_NAME = 'general-survey';
const ACCESS_COUNT_STORAGE_KEY = 'casino_demo_access_count_by_user';
// Fire the general survey once the same demo user has logged in five times.
const GENERAL_SURVEY_LOGIN_TARGET = 5;
const SEARCH_WINDOW_MS = 120 * 1000;
const SEARCH_BACK_WINDOW_MS = 60 * 1000;
const SEARCH_EVENT_DEDUP_MS = 1200;

// Create the SDK facade used by the casino demo to connect route, search, and login milestones to popup events.
export function createCasinoSdk({ apiKey }) {
  let sdk = null;

  // Track search intent signals inside the host app before emitting the SDK event.
  const searchBehavior = {
    searchTimestamps: [],
    lastSearchResultClickAt: 0,
    pendingBackAfterSearchClickAt: 0,
    lastBackAfterSearchClickAt: 0,
    lastCountedQuery: '',
    lastCountedAt: 0,
    lastEventEmitAt: 0,
  };

  // Initialize the popup SDK for the active demo user and restart the demo-specific state.
  function init(userId) {
    removePopupContainers();
    resetSearchBehavior();

    sdk = new DeepdotsPopups();
    sdk.init({
      mode: 'server',
      nodeEnv: 'production',
      debug: true,
      apiKey,
      userId,
    });
    sdk.autoLaunch();
  }

  // Update search-related state after route changes so the "search -> click -> back -> search" pattern can be detected.
  function handleRouteTransition(fromRoute, toRoute) {
    if (fromRoute === 'game' && toRoute === 'home' && searchBehavior.pendingBackAfterSearchClickAt) {
      searchBehavior.lastBackAfterSearchClickAt = Date.now();
      searchBehavior.pendingBackAfterSearchClickAt = 0;
    }
  }

  // Evaluate a search interaction and emit the `search` SDK event when one of the configured intent rules matches.
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

  // Mark that the user clicked a search result so later searches can distinguish engaged vs. disengaged behavior.
  function markSearchResultClick() {
    const now = Date.now();
    searchBehavior.lastSearchResultClickAt = now;
    searchBehavior.pendingBackAfterSearchClickAt = now;
  }

  // Expose a minimal debug API in the browser console for manual demo testing.
  function exposeDebugApi() {
    if (typeof window === 'undefined') {
      return;
    }

    window.__casinoDemo = {
      triggerGeneralSurveyEvent: () => emitGeneralSurveyEvent('manual_debug'),
      triggerSearchEvent: () => emitSearchEvent('manual_debug'),
    };
  }

  // Register one completed login for the current user and trigger `general-survey` on the fifth access.
  function registerUserAccess(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      return { accessCount: 0, triggered: false, userId: '' };
    }

    const accessCount = incrementAccessCount(normalizedUserId);
    const triggered = accessCount === GENERAL_SURVEY_LOGIN_TARGET;

    console.info('[casino-demo] user access registered', {
      userId: normalizedUserId,
      accessCount,
      triggered,
    });

    if (triggered) {
      emitGeneralSurveyEvent('login_threshold_reached', {
        accessCount,
        userId: normalizedUserId,
      });
    }

    return {
      accessCount,
      triggered,
      userId: normalizedUserId,
    };
  }

  // Emit the `search` SDK event with a short dedup window to avoid flooding repeated triggers.
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
    emitSdkEvent(SEARCH_EVENT_NAME, { reason });
  }

  // Emit the general survey event used by the login-access rule.
  function emitGeneralSurveyEvent(reason, context = {}) {
    emitSdkEvent(GENERAL_SURVEY_EVENT_NAME, {
      reason,
      ...context,
    });
  }

  // Send any host-driven event to the SDK after normalizing the name and logging the context for debugging.
  function emitSdkEvent(eventName, context = {}) {
    if (!sdk || typeof sdk.triggerEvent !== 'function') {
      console.warn('[casino-demo] sdk.triggerEvent is not available yet');
      return;
    }

    const normalizedEventName = String(eventName || '').trim();
    if (!normalizedEventName) {
      return;
    }

    console.info('[casino-demo] triggerEvent', {
      eventName: normalizedEventName,
      ...context,
    });
    sdk.triggerEvent(normalizedEventName);
  }

  // Keep only recent searches inside the rolling time window used by the demo intent rules.
  function pruneOldSearches(now) {
    const threshold = now - SEARCH_WINDOW_MS;
    searchBehavior.searchTimestamps = searchBehavior.searchTimestamps.filter((timestamp) => timestamp >= threshold);
  }

  // Reset all in-memory search state whenever the active user session is reinitialized.
  function resetSearchBehavior() {
    searchBehavior.searchTimestamps = [];
    searchBehavior.lastSearchResultClickAt = 0;
    searchBehavior.pendingBackAfterSearchClickAt = 0;
    searchBehavior.lastBackAfterSearchClickAt = 0;
    searchBehavior.lastCountedQuery = '';
    searchBehavior.lastCountedAt = 0;
    searchBehavior.lastEventEmitAt = 0;
  }

  // Remove any previous popup container before recreating the SDK to keep the demo DOM clean.
  function removePopupContainers() {
    document.querySelectorAll('#deepdots-popup-container').forEach((container) => {
      container.remove();
    });
  }

  // Increase the persisted access counter for one user and return the new value.
  function incrementAccessCount(userId) {
    const counts = readAccessCounts();
    const previousCount = Number.isFinite(counts[userId]) ? counts[userId] : 0;
    const nextCount = previousCount + 1;

    counts[userId] = nextCount;
    writeAccessCounts(counts);

    return nextCount;
  }

  // Read the stored per-user access counters from localStorage and discard invalid payloads.
  function readAccessCounts() {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(ACCESS_COUNT_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => Number.isFinite(value) && value >= 0),
      );
    } catch {
      return {};
    }
  }

  // Persist the current per-user access counters so the login milestone survives page reloads.
  function writeAccessCounts(counts) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(ACCESS_COUNT_STORAGE_KEY, JSON.stringify(counts));
    } catch {
      // Ignore storage errors in demo context.
    }
  }

  return {
    exposeDebugApi,
    handleRouteTransition,
    init,
    markSearchResultClick,
    registerUserAccess,
    registerSearchAction,
  };
}
