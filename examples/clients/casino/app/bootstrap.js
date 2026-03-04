import {
  bindView,
  FALLBACK_VIEWS,
  getGameById,
} from '../content.js';
import { createRouteManager, DEFAULT_ROUTE } from '../navigation.js';
import { createCasinoSdk } from '../sdk.js';
import { createAppHandlers } from './handlers.js';
import { CASINO_API_KEY } from './constants.js';
import { bindShellEvents, getAppElements } from './shell.js';
import { createAppState, writeStoredUser } from './state.js';

export async function startCasinoApp() {
  const state = createAppState();
  const elements = getAppElements();
  const casinoSdk = createCasinoSdk({ apiKey: CASINO_API_KEY });

  let router = null;

  const navigate = (route, options = {}) => {
    router?.navigate(route, options);
  };

  const { handleCasinoLogin, handleUserChange } = createAppHandlers({
    state,
    casinoSdk,
    writeStoredUser,
  });

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
        onCasinoLogin: handleCasinoLogin,
        onUserChange: handleUserChange,
        onSearchAction: casinoSdk.registerSearchAction,
        onSearchResultClick: casinoSdk.markSearchResultClick,
      });
    },
    onRouteTransition: casinoSdk.handleRouteTransition,
  });

  bindShellEvents({ elements, navigate });
  casinoSdk.exposeDebugApi();
  handleUserChange(state.userId);

  await router.start();
}
