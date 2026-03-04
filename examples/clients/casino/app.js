import {
  bindView,
  DEFAULT_GAME_ID,
  DEFAULT_USER_ID,
  FALLBACK_VIEWS,
  getGameById,
} from './content.js';
import { createRouteManager, DEFAULT_ROUTE } from './navigation.js';
import { createCasinoSdk } from './sdk.js';

const API_KEY = '6ZYgj8csaOEakUfZ2YmjgOg6CQsQLYnl';
const STORAGE_KEY_USER = 'casino_demo_user';

const state = {
  route: DEFAULT_ROUTE,
  userId: readStoredUser() || DEFAULT_USER_ID,
  gameId: DEFAULT_GAME_ID,
};

const elements = {
  app: document.getElementById('app'),
  btnNavLogin: document.getElementById('btn-nav-login'),
};

const casinoSdk = createCasinoSdk({ apiKey: API_KEY });

let router = null;

init();

async function init() {
  router = createRouteManager({
    state,
    root: elements.app,
    getFallbackView: (route) => FALLBACK_VIEWS[route] || FALLBACK_VIEWS[DEFAULT_ROUTE],
    isValidGameId: (gameId) => Boolean(getGameById(gameId)),
    onRender: (route) => {
      bindView(route, {
        root: elements.app,
        state,
        navigate,
        onUserChange: handleUserChange,
        onSearchAction: casinoSdk.registerSearchAction,
        onSearchResultClick: casinoSdk.markSearchResultClick,
      });
    },
    onRouteTransition: casinoSdk.handleRouteTransition,
  });

  bindShellEvents();
  casinoSdk.exposeDebugApi();
  handleUserChange(state.userId);

  await router.start();
}

function bindShellEvents() {
  elements.btnNavLogin?.addEventListener('click', () => {
    navigate('login');
  });
}

function navigate(route, options = {}) {
  router?.navigate(route, options);
}

function handleUserChange(userId) {
  state.userId = userId;
  writeStoredUser(userId);
  casinoSdk.init(userId);
}

function readStoredUser() {
  try {
    return sessionStorage.getItem(STORAGE_KEY_USER) || '';
  } catch {
    return '';
  }
}

function writeStoredUser(userId) {
  try {
    sessionStorage.setItem(STORAGE_KEY_USER, userId);
  } catch {
    // Ignore storage errors in demo context.
  }
}
