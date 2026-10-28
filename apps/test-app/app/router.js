// Router de la SPA. Dos modos, elegidos con ?nav=:
//
//   history  pushState/popstate, como cualquier SPA (React Router, Vue Router…). El SDK web se
//            entera solo de cada cambio de ruta (parchea la History API).
//   silent   cambia la vista SIN tocar la URL ni la History API. Es el host que no avisa al SDK
//            del cambio de pantalla (un router en memoria, o una app RN que olvida setScreen):
//            el SDK sigue creyendo que el usuario está en la primera ruta. Es el modo del
//            failure test obligatorio: los triggers que dependen de la navegación no saltan.
//
// La query (?sdk=…&scenario=…) se conserva en cada navegación: el service worker la lee de la
// URL de la pestaña.

const routes = [];
let mode = 'history';
let current = null;
let onChange = () => {};

export function defineRoute(pattern, view) {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/\/:([a-z]+)/gi, (_, k) => (keys.push(k), '/([^/]+)')) + '/?$',
  );
  routes.push({ pattern, regex, keys, view });
}

function match(path) {
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function currentPath() {
  return current?.path ?? location.pathname;
}

export function startRouter({ navMode, onRoute }) {
  mode = navMode;
  onChange = onRoute;
  window.addEventListener('popstate', () => render(location.pathname, 'popstate'));
  // Enlaces internos: <a href="/products" data-link>
  document.addEventListener('click', (event) => {
    const a = event.target.closest?.('a[data-link]');
    if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    navigate(a.getAttribute('href'));
  });
  render(location.pathname, 'initial');
}

export function navigate(path) {
  if (path === currentPath()) return;
  if (mode === 'history') {
    history.pushState({}, '', path + location.search);
  }
  render(path, mode === 'history' ? 'pushState' : 'silent');
}

function render(path, how) {
  const from = current?.path ?? null;
  const found = match(path) ?? match('/404');
  current = { path, ...found };
  onChange({ from, to: path, how, route: found.route, params: found.params });
}
