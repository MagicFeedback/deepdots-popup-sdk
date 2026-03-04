export const DEFAULT_ROUTE = 'login';

const ROUTES = {
  login: new URL('./login/index.html', import.meta.url).href,
  home: new URL('./home/index.html', import.meta.url).href,
  game: new URL('./game/index.html', import.meta.url).href,
};

const NOOP = () => {};

export function createRouteManager({
  state,
  root,
  getFallbackView = () => '',
  isValidGameId = () => false,
  onRender = NOOP,
  onRouteTransition = NOOP,
}) {
  const viewCache = new Map();

  function start() {
    window.addEventListener('hashchange', () => {
      void renderFromHash(true);
    });

    return renderFromHash(false);
  }

  function navigate(route, options = {}) {
    const nextRoute = resolveRoute(route);
    if (nextRoute === 'game' && options.gameId && isValidGameId(options.gameId)) {
      state.gameId = options.gameId;
    }

    state.route = nextRoute;
    const nextHash = buildHash(state.route, state.gameId);
    if (window.location.hash === nextHash) {
      void renderRoute();
      return;
    }

    writeHash(state.route, state.gameId, false);
  }

  async function renderFromHash(fromHashEvent) {
    const previousRoute = state.route;
    const parsed = parseHash(window.location.hash);
    state.route = parsed.route;

    if (parsed.gameId && isValidGameId(parsed.gameId)) {
      state.gameId = parsed.gameId;
    }

    await renderRoute();
    onRouteTransition(previousRoute, state.route);

    if (!fromHashEvent) {
      writeHash(state.route, state.gameId, true);
    }
  }

  async function renderRoute() {
    if (!root) {
      return;
    }

    root.className = `app-shell route-${state.route}`;

    const html = await loadViewHtml(state.route);
    root.innerHTML = html;
    onRender(state.route);
  }

  async function loadViewHtml(route) {
    if (viewCache.has(route)) {
      return viewCache.get(route);
    }

    const path = ROUTES[route] || ROUTES[DEFAULT_ROUTE];
    try {
      const response = await fetch(path);
      if (!response.ok) {
        console.error('[casino-demo] view load failed', { route, path, status: response.status });
        const fallback = getFallbackView(route) || getFallbackView(DEFAULT_ROUTE);
        viewCache.set(route, fallback);
        return fallback;
      }

      const html = await response.text();
      viewCache.set(route, html);
      return html;
    } catch (error) {
      console.error('[casino-demo] view load error', { route, path, error: String(error) });
      const fallback = getFallbackView(route) || getFallbackView(DEFAULT_ROUTE);
      viewCache.set(route, fallback);
      return fallback;
    }
  }

  function resolveRoute(route) {
    return Object.prototype.hasOwnProperty.call(ROUTES, route) ? route : DEFAULT_ROUTE;
  }

  function parseHash(hash) {
    const raw = (hash || '').replace(/^#\/?/, '');
    if (!raw) {
      return { route: DEFAULT_ROUTE, gameId: '' };
    }

    const [path, queryRaw] = raw.split('?');
    const route = resolveRoute(path);
    const params = new URLSearchParams(queryRaw || '');
    const gameId = params.get('game') || '';
    return { route, gameId };
  }

  function buildHash(route, gameId) {
    const params = new URLSearchParams();
    if (route === 'game' && gameId) {
      params.set('game', gameId);
    }

    const suffix = params.toString();
    return suffix ? `#/${route}?${suffix}` : `#/${route}`;
  }

  function writeHash(route, gameId, replace) {
    const hash = buildHash(route, gameId);

    if (replace) {
      history.replaceState(null, '', hash);
      return;
    }

    window.location.hash = hash;
  }

  return {
    navigate,
    start,
  };
}
