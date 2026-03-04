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

const NOOP = () => {};

export const DEFAULT_USER_ID = USERS[0].id;
export const DEFAULT_GAME_ID = GAMES[0].id;

export const FALLBACK_VIEWS = {
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

export function getGameById(gameId) {
  return GAMES.find((game) => game.id === gameId) || null;
}

export function bindView(route, context) {
  const { root } = context;
  if (!(root instanceof HTMLElement)) {
    return;
  }

  if (route === 'login') {
    bindLoginView(context);
    return;
  }

  if (route === 'home') {
    bindHomeView(context);
    return;
  }

  if (route === 'game') {
    bindGameView(context);
  }
}

function bindLoginView({ root, state, navigate, onUserChange = NOOP }) {
  const select = root.querySelector('#login-user-select');
  const button = root.querySelector('#btn-enter-home');
  const label = root.querySelector('#login-selected-user');

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
      const nextUserId = select.value;
      onUserChange(nextUserId);
      if (label) {
        label.textContent = nextUserId;
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

function bindHomeView({
  root,
  state,
  navigate,
  onSearchAction = NOOP,
  onSearchResultClick = NOOP,
}) {
  const welcome = root.querySelector('#home-user');
  const openSearchButton = root.querySelector('#btn-open-search');
  const sideSearchButton = root.querySelector('#btn-side-search');
  const searchOverlay = root.querySelector('#home-search-overlay');
  const closeSearchButton = root.querySelector('#btn-close-search');
  const searchInput = root.querySelector('#home-search-input');
  const searchGrid = root.querySelector('#home-search-grid');

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
        onSearchAction(searchInput.value);
      }, 650);
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        onSearchAction(searchInput.value);
      }
    });
  }

  searchGrid?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button[data-search-game-id]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const gameId = button.getAttribute('data-search-game-id');
    if (!gameId || !getGameById(gameId)) {
      return;
    }
    onSearchResultClick();
    closeSearch();
    navigate('game', { gameId });
  });

  root.querySelectorAll('button[data-game-id]').forEach((node) => {
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

function bindGameView({ root, state, navigate }) {
  const game = getGameById(state.gameId) || GAMES[0];
  const title = root.querySelector('#game-title');
  const detail = root.querySelector('#game-detail');

  if (title) {
    title.textContent = game.title;
  }

  if (detail) {
    detail.textContent = game.detail;
  }

  root.querySelector('#btn-back-home')?.addEventListener('click', () => {
    navigate('home');
  });

  root.querySelector('#btn-go-login')?.addEventListener('click', () => {
    navigate('login');
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
