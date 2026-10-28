// Arranque de la test app: service worker (red del laboratorio) → tienda → SDK.
//
// El SDK se carga y se inicializa como lo haría un cliente: import del artefacto publicado,
// `init({ apiKey, nodeEnv: 'development' })` y `autoLaunch()`. Todo lo demás (fixtures, fallos,
// bloqueo de producción) ocurre por debajo, en la red, sin tocar el SDK.

import { lab } from './lab.js';
import { readParams, toQuery } from './params.js';
import { loadSdk } from './sdk-loader.js';
import { createShop } from './shop.js';
import { startRouter, navigate } from './router.js';
import { mountLabUi } from './lab-ui.js';
import { watchPopup } from './popup-watch.js';
import { DEV } from './config.js';

const params = readParams();
lab.params = params;
let started = false;
let lastRoute = null;

if (params.css === 'clean') document.getElementById('competing-css')?.remove();

mountLabUi({
  toolbar: document.getElementById('lab-toolbar'),
  devtools: document.getElementById('lab-devtools'),
  params,
  apply(values) {
    location.href = location.pathname + toQuery(values);
  },
  reset() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    location.reload();
  },
});

lab.log('host', 'run', `${lab.runId} · ${toQuery(params) || '(defaults)'}`);

await ensureServiceWorker();

const shop = createShop({
  root: document.getElementById('host-root'),
  lang: params.lang,
  hooks: {
    onHostAction: (name, data) => lab.log('host', name, data),
    onLanguage(next) {
      try {
        localStorage.setItem('nordly.lang', next);
      } catch {
        /* ignore */
      }
      lab.log('host', 'language', next);
      location.href = location.pathname + toQuery({ ...params, lang: next });
    },
    onRate(id) {
      lab.log('host', 'rate_product', { id });
      // Evento de negocio del host → trigger `event` del popup.
      lab.sdk?.triggerEvent('rate_product');
    },
    onConsent(choice) {
      if (params.load === 'consent') startSdk(`consent:${choice}`);
    },
    rerender: () => renderRoute(lastRoute),
  },
});

function renderRoute(info) {
  lastRoute = info;
  shop.render(info.route.view(info.params));
}

startRouter({
  navMode: params.nav,
  onRoute(info) {
    renderRoute(info);
    if (info.how !== 'initial') lab.log('route', `${info.from} → ${info.to}`, info.how);
    else lab.log('route', info.to, 'initial');
  },
});

window.__labNavigate = navigate;
watchPopup();

if (params.load === 'immediate') startSdk('immediate');
else if (params.load === 'delayed') setTimeout(() => startSdk('delayed 2s'), 2000);
else if (params.load === 'consent' && shop.hasConsent()) startSdk('consent (stored)');
else lab.log('host', 'sdk load waits for cookie consent');

// ---------------------------------------------------------------------------------------------

async function startSdk(reason) {
  if (started) return;
  started = true;
  lab.log('host', `load sdk (${reason})`, params.sdk);
  try {
    const { mod, version, url } = await loadSdk(params.sdk);
    lab.sdkVersion = version;
    lab.sdkUrl = url;
    document.title = `NORDLY · SDK ${version}`;
    lab.log('sdk', 'loaded', `${version} · ${url}`);

    const sdk = new mod.DeepdotsPopups();
    const apiKey = params.popups === 'live' ? DEV.popupsApiKey : 'sdk-lab-fixture';
    const config = {
      apiKey,
      nodeEnv: 'development',
      debug: params.debug === '1',
      language: params.lang,
      geolocation: false,
    };
    if (params.user) config.userId = params.user;
    sdk.init(config);
    sdk.on('popup_shown', (e) => lab.log('event', 'popup_shown', pick(e)));
    sdk.on('popup_clicked', (e) => lab.log('event', 'popup_clicked', pick(e)));
    sdk.on('survey_completed', (e) => lab.log('event', 'survey_completed', pick(e)));
    sdk.autoLaunch();

    lab.sdk = sdk;
    window.deepdots = sdk;
    lab.log('sdk', 'init', `nodeEnv=development language=${params.lang} popups=${params.popups}`);
  } catch (error) {
    lab.sdkError = String(error?.message || error);
    lab.log('error', 'sdk load failed', lab.sdkError);
  } finally {
    lab.ready = true;
  }
}

function pick(e) {
  const out = { survey: e.surveyId };
  if (e.data?.popupId) out.popup = e.data.popupId;
  if (e.data?.action) out.action = e.data.action;
  return out;
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    lab.log('error', 'service worker unavailable: fixtures and fault injection are off');
    return;
  }
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'lab:network') lab.addNetwork(event.data.entry);
  });
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  if (navigator.serviceWorker.controller) return;
  // Primera visita: el worker toma la página con clients.claim(). Sin esto las peticiones de
  // esta carga saldrían sin pasar por él.
  await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
}
