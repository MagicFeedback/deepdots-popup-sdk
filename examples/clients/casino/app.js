import { DeepdotsPopups } from '../../../dist/index.mjs';

const API_KEY = '6ZYgj8csaOEakUfZ2YmjgOg6CQsQLYnl';
const STORAGE_KEY_USER = 'casino_demo_user';

const USERS = [
  { id: 'user_eligible', label: 'Demo user A' },
  { id: 'user_cooldown', label: 'Demo user B' },
  { id: 'user_blocked', label: 'Demo user C' },
  { id: 'user_search_ready', label: 'Demo user D' },
];

const GAMES = [
  {
    id: 'knights-vs-barbarians',
    title: 'Knights vs Barbarians',
    detail: 'Fast rounds and high-volatility bonus windows.',
  },
  {
    id: 'arcanum',
    title: 'Arcanum',
    detail: 'Medium-variance flow with steady pacing.',
  },
  {
    id: 'action-boost-fortune',
    title: 'Action Boost Fortune',
    detail: 'Momentum-heavy game profile for short sessions.',
  },
  {
    id: 'gates-of-olympus',
    title: 'Gates of Olympus',
    detail: 'Classic high-volatility slot with stacked symbols.',
  },
  {
    id: 'sweet-bonanza',
    title: 'Sweet Bonanza',
    detail: 'Candy-themed slot with cascading reels.',
  },
  {
    id: 'gates-of-olympus-super-scatter',
    title: 'Gates of Olympus Super Scatter',
    detail: 'Enhanced Olympus variant with scatter-heavy rounds.',
  },
  {
    id: 'sweet-bonanza-1000',
    title: 'Sweet Bonanza 1000',
    detail: 'High multiplier variant with larger prize potential.',
  },
  {
    id: 'gates-of-olympus-1000',
    title: 'Gates of Olympus 1000',
    detail: '1000x multiplier version of the Olympus family.',
  },
  {
    id: 'sugar-rush-1000',
    title: 'Sugar Rush 1000',
    detail: 'Colorful multiplier grid with volatile rounds.',
  },
];

const SEARCH_GAMES = [
  {
    id: 'gates-of-olympus',
    title: 'Gates of Olympus',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-olympus',
  },
  {
    id: 'sweet-bonanza',
    title: 'Sweet Bonanza',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-bonanza',
  },
  {
    id: 'gates-of-olympus-super-scatter',
    title: 'Gates of Olympus Super Scatter',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-scatter',
  },
  {
    id: 'sweet-bonanza-1000',
    title: 'Sweet Bonanza 1000',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-bonanza-1000',
  },
  {
    id: 'gates-of-olympus-1000',
    title: 'Gates of Olympus 1000',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-olympus-1000',
  },
  {
    id: 'sugar-rush-1000',
    title: 'Sugar Rush 1000',
    minBet: 'Min. 1 kr.',
    coverClass: 'search-cover-rush',
  },
];

const ROUTES = {
  login: new URL('./login/index.html', import.meta.url).href,
  home: new URL('./home/index.html', import.meta.url).href,
  game: new URL('./game/index.html', import.meta.url).href,
};

const FALLBACK_VIEWS = {
  login: `
    <section class="panel login-layout">
      <p>Demo access</p>
      <h1>Log ind for at spille</h1>
      <p>Select a demo user before entering the casino.</p>
      <label for="login-user-select">Demo user</label>
      <select id="login-user-select"></select>
      <p>Selected user: <strong id="login-selected-user"></strong></p>
      <div class="button-row">
        <button id="btn-enter-home" type="button">Enter Casino</button>
      </div>
    </section>
  `,
  home: buildHomeViewTemplate(),
  game: `
    <section class="panel game-page">
      <p>Game detail</p>
      <h1 id="game-title">Game</h1>
      <p id="game-detail"></p>
      <div class="game-stage">GAME VIEW</div>
      <div class="button-row">
        <button id="btn-back-home" type="button">Back to Lobby</button>
        <button id="btn-go-login" class="secondary" type="button">Back to Login</button>
      </div>
    </section>
  `,
};

const DEFAULT_ROUTE = 'login';
const SEARCH_EVENT_NAME = 'search';
const SEARCH_WINDOW_MS = 120 * 1000;
const SEARCH_BACK_WINDOW_MS = 60 * 1000;
const SEARCH_EVENT_DEDUP_MS = 1200;

const state = {
  route: DEFAULT_ROUTE,
  userId: readStoredUser() || USERS[0].id,
  gameId: GAMES[0].id,
};

const searchBehavior = {
  searchTimestamps: [],
  lastSearchResultClickAt: 0,
  pendingBackAfterSearchClickAt: 0,
  lastBackAfterSearchClickAt: 0,
  lastCountedQuery: '',
  lastCountedAt: 0,
  lastEventEmitAt: 0,
};

let sdk = null;
const viewCache = new Map();

const elements = {
  app: document.getElementById('app'),
  btnNavLogin: document.getElementById('btn-nav-login'),
  sdkStatus: document.getElementById('sdk-status'),
};

init();

async function init() {
  exposeDebugApi();
  bindShellEvents();
  initSdk(state.userId, 'app start');

  window.addEventListener('hashchange', () => {
    void renderFromHash(true);
  });

  await renderFromHash(false);
}

function bindShellEvents() {
  elements.btnNavLogin?.addEventListener('click', () => {
    navigate('login');
  });
}

async function renderFromHash(fromHashEvent) {
  const previousRoute = state.route;
  const parsed = parseHash(window.location.hash);
  state.route = parsed.route;

  if (parsed.gameId && gameById(parsed.gameId)) {
    state.gameId = parsed.gameId;
  }

  await renderRoute();
  handleRouteTransition(previousRoute, state.route);

  if (!fromHashEvent) {
    writeHash(state.route, state.gameId, true);
  }
}

function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw) {
    return { route: DEFAULT_ROUTE, gameId: '' };
  }

  const [path, queryRaw] = raw.split('?');
  const route = Object.prototype.hasOwnProperty.call(ROUTES, path) ? path : DEFAULT_ROUTE;
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
  } else {
    window.location.hash = hash;
  }
}

function navigate(route, options = {}) {
  const nextRoute = Object.prototype.hasOwnProperty.call(ROUTES, route) ? route : DEFAULT_ROUTE;
  if (nextRoute === 'game' && options.gameId && gameById(options.gameId)) {
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

async function renderRoute() {
  if (!elements.app) {
    return;
  }

  elements.app.className = `app-shell route-${state.route}`;

  const html = await loadViewHtml(state.route);
  elements.app.innerHTML = html;

  if (state.route === 'login') {
    bindLoginView();
    return;
  }
  if (state.route === 'home') {
    bindHomeView();
    return;
  }
  if (state.route === 'game') {
    bindGameView();
  }
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
      const fallback = FALLBACK_VIEWS[route] || FALLBACK_VIEWS[DEFAULT_ROUTE];
      viewCache.set(route, fallback);
      return fallback;
    }

    const html = await response.text();
    viewCache.set(route, html);
    return html;
  } catch (error) {
    console.error('[casino-demo] view load error', { route, path, error: String(error) });
    const fallback = FALLBACK_VIEWS[route] || FALLBACK_VIEWS[DEFAULT_ROUTE];
    viewCache.set(route, fallback);
    return fallback;
  }
}

function bindLoginView() {
  const select = document.getElementById('login-user-select');
  const button = document.getElementById('btn-enter-home');
  const label = document.getElementById('login-selected-user');

  if (select instanceof HTMLSelectElement) {
    select.innerHTML = '';
    USERS.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.id} - ${user.label}`;
      select.appendChild(option);
    });
    select.value = state.userId;

    select.addEventListener('change', () => {
      state.userId = select.value;
      writeStoredUser(state.userId);
      initSdk(state.userId, 'user changed');
      if (label) {
        label.textContent = state.userId;
      }
    });
  }

  if (label) {
    label.textContent = state.userId;
  }

  button?.addEventListener('click', () => {
    navigate('home');
  });
}

function bindHomeView() {
  const welcome = document.getElementById('home-user');
  const openSearchButton = document.getElementById('btn-open-search');
  const sideSearchButton = document.getElementById('btn-side-search');
  const searchOverlay = document.getElementById('home-search-overlay');
  const closeSearchButton = document.getElementById('btn-close-search');
  const searchInput = document.getElementById('home-search-input');
  const searchGrid = document.getElementById('home-search-grid');

  if (welcome) {
    welcome.textContent = state.userId;
  }

  const renderSearchCards = (query = '') => {
    if (!searchGrid) {
      return;
    }

    const normalized = query.trim().toLowerCase();
    const filtered = SEARCH_GAMES.filter((game) => {
      if (!normalized) {
        return true;
      }
      return game.title.toLowerCase().includes(normalized);
    });

    searchGrid.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = 'Ingen spil matcher søgningen.';
      searchGrid.appendChild(empty);
      return;
    }

    filtered.forEach((game) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'search-game-card';
      card.setAttribute('data-search-game-id', game.id);
      card.innerHTML = `
        <span class="search-game-cover ${game.coverClass}"></span>
        <span class="search-game-title">${game.title}</span>
        <span class="search-game-minbet">${game.minBet}</span>
      `;
      searchGrid.appendChild(card);
    });
  };

  const openSearch = () => {
    if (!searchOverlay) {
      return;
    }
    searchOverlay.classList.remove('hidden');
    renderSearchCards('');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = '';
      searchInput.focus();
    }
  };

  const closeSearch = () => {
    searchOverlay?.classList.add('hidden');
  };

  openSearchButton?.addEventListener('click', openSearch);
  sideSearchButton?.addEventListener('click', openSearch);
  closeSearchButton?.addEventListener('click', closeSearch);

  searchOverlay?.addEventListener('click', (event) => {
    if (event.target === searchOverlay) {
      closeSearch();
    }
  });

  if (searchInput instanceof HTMLInputElement) {
    let inputTimer = 0;
    searchInput.addEventListener('input', () => {
      renderSearchCards(searchInput.value);
      if (inputTimer) {
        window.clearTimeout(inputTimer);
      }
      inputTimer = window.setTimeout(() => {
        registerSearchAction(searchInput.value);
      }, 650);
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        registerSearchAction(searchInput.value);
      }
    });
  }

  searchGrid?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('button[data-search-game-id]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const gameId = button.getAttribute('data-search-game-id');
    if (!gameId || !gameById(gameId)) {
      return;
    }
    markSearchResultClick();
    closeSearch();
    navigate('game', { gameId });
  });

  document.querySelectorAll('button[data-game-id]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', () => {
      const gameId = node.getAttribute('data-game-id');
      if (!gameId) {
        return;
      }
      navigate('game', { gameId });
    });
  });
}

function bindGameView() {
  const game = gameById(state.gameId) || GAMES[0];
  const title = document.getElementById('game-title');
  const detail = document.getElementById('game-detail');

  if (title) {
    title.textContent = game.title;
  }
  if (detail) {
    detail.textContent = game.detail;
  }

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    navigate('home');
  });

  document.getElementById('btn-go-login')?.addEventListener('click', () => {
    navigate('login');
  });
}

function initSdk(userId, reason) {
  removePopupContainers();
  resetSearchBehavior();
  sdk = new DeepdotsPopups();
  sdk.init({
    mode: 'server',
    nodeEnv: 'development',
    debug: true,
    apiKey: API_KEY,
    // userId,
  });
  sdk.autoLaunch();

  console.info('[casino-demo] sdk.init', {
    mode: 'server',
    nodeEnv: 'development',
    userId,
    reason,
  });
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

function exposeDebugApi() {
  if (typeof window === 'undefined') {
    return;
  }
  window.__casinoDemo = {
    triggerSearchEvent: () => emitSearchEvent('manual_debug'),
    triggerSdkEvent: (eventName) => {
      if (!sdk || typeof sdk.triggerEvent !== 'function') {
        console.warn('[casino-demo] sdk.triggerEvent is not available yet');
        return;
      }
      sdk.triggerEvent(String(eventName || ''));
    },
    getSearchState: () => ({ ...searchBehavior }),
  };
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

function gameById(gameId) {
  return GAMES.find((game) => game.id === gameId) || null;
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

function removePopupContainers() {
  document.querySelectorAll('#deepdots-popup-container').forEach((container) => {
    container.remove();
  });
}

function buildHomeViewTemplate() {
  return `
    <section class="home-shell">
      <aside class="left-menu">
        <section>
          <h2>CASINO</h2>
          <ul>
            <li><button type="button">Alle spil</button></li>
            <li><button type="button">Mest populære</button></li>
            <li><button type="button">Bordspil</button></li>
            <li><button type="button">Jackpotspil</button></li>
          </ul>
        </section>
        <section>
          <h2>SE OGSÅ</h2>
          <ul>
            <li><button id="btn-side-search" type="button">Find spil</button></li>
            <li><button type="button">Indbetal</button></li>
            <li><button type="button">Hæv</button></li>
          </ul>
        </section>
      </aside>

      <section class="content-column">
        <button id="btn-open-search" class="search-pill" type="button" aria-label="Open search">
          🔎 Hvad vil du gerne spille?
        </button>

        <section class="hero-zone">
          <article class="hero-feature">
            <p class="hero-kicker">DAGENS LANCERING</p>
            <h1>Knights vs Barbarians</h1>
            <p>
              Demo journey for popup orchestration in a real casino flow:
              eligibility comes from API and surveys are only launched in safe moments.
            </p>
            <p class="home-user-note">Demo user: <strong id="home-user"></strong></p>
            <div class="hero-actions">
              <button type="button">Start Session</button>
              <button class="ghost" type="button">Reset</button>
              <button class="ghost" type="button">Sync API</button>
            </div>
          </article>

          <aside class="hero-side-list">
            <article><span class="thumb"></span><div><strong>Mest populære</strong><p>Sugar Rush Super Scatter</p></div></article>
            <article><span class="thumb"></span><div><strong>Har du prøvet?</strong><p>Le Fisherman</p></div></article>
            <article><span class="thumb"></span><div><strong>Jag jackpotten</strong><p>Bison Rising Megaways</p></div></article>
          </aside>
        </section>

        <section class="section-block">
          <header><h2>Nye spil</h2><span>Se alle</span></header>
          <div class="game-grid">
            <article class="game-card"><div class="cover cover-neon"></div><h3>Knights vs Barbarians</h3><p>Min. 1 kr</p><button type="button" data-game-id="knights-vs-barbarians">Play Demo Round</button></article>
            <article class="game-card"><div class="cover cover-arcanum"></div><h3>Arcanum</h3><p>Min. 1 kr</p><button type="button" data-game-id="arcanum">Play Demo Round</button></article>
            <article class="game-card"><div class="cover cover-fortune"></div><h3>Action Boost Fortune</h3><p>Min. 2 kr</p><button type="button" data-game-id="action-boost-fortune">Play Demo Round</button></article>
          </div>
        </section>

        <section class="section-block">
          <header><h2>Jackpots</h2><span>Se alle</span></header>
          <div class="jackpot-grid">
            <article class="jackpot-card blue">Jackpot Must Go</article>
            <article class="jackpot-card cyan">Diamond Link</article>
            <article class="jackpot-card green">Rapid Fire Jackpots</article>
          </div>
        </section>
      </section>

      <div id="home-search-overlay" class="search-overlay hidden" role="dialog" aria-modal="true">
        <div class="search-modal">
          <div class="search-modal-head">
            <label class="search-input-wrap" for="home-search-input">
              <span>🔎</span>
              <input id="home-search-input" type="text" placeholder="Hvad vil du gerne spille?" />
            </label>
            <button id="btn-close-search" class="search-close" type="button">LUK</button>
          </div>
          <h3>Populære søgninger</h3>
          <div id="home-search-grid" class="search-game-grid"></div>
        </div>
      </div>
    </section>
  `;
}
