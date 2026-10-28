// Service worker de la test app: la capa de red del laboratorio.
//
// Ve TODAS las peticiones de la página, también las que no pasan por `fetch` (el renderer de
// encuestas, @magicfeedback/native, envía con XMLHttpRequest), y las que salen de un SDK cargado
// desde el CDN. Por eso los fixtures, los fallos inyectados y el bloqueo de producción viven aquí
// y no en un parche de `window.fetch`.
//
// La configuración la lee de la URL de la pestaña que hace la petición (`?scenario=…&fault=…`):
// el router de la app conserva la query en cada navegación, y así el worker no guarda estado
// que se pierda cuando el navegador lo duerme.

const DEV_HOST = 'api-dev.deepdots.com';
const PROD_HOSTS = ['api.deepdots.com', 'api.magicfeedback.io'];
const TRACKED_HOSTS = [DEV_HOST, ...PROD_HOSTS, 'cdn.jsdelivr.net', 'registry.npmjs.org'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!TRACKED_HOSTS.includes(url.hostname)) return;
  event.respondWith(handle(event, url));
});

let scenariosPromise = null;
function loadScenarios() {
  scenariosPromise ??= fetch('/app/scenarios.json').then((r) => r.json());
  return scenariosPromise;
}

// Los fixtures "conocidos como buenos" del manifiesto de compatibilidad de MF-3241: lo que
// cualquier versión publicada tiene que seguir aceptando y mostrando.
async function loadReleaseFixtures() {
  const manifest = await fetch('/release/compatibility.json').then((r) => r.json());
  const files = await Promise.all(manifest.fixtures.map((f) => fetch(`/${f.path}`).then((r) => r.json())));
  return files.flat();
}

async function labOf(clientId) {
  const client = clientId ? await self.clients.get(clientId) : null;
  const params = client ? new URL(client.url).searchParams : new URLSearchParams();
  return {
    client,
    scenario: params.get('scenario') || 'all',
    popups: params.get('popups') || 'fixture',
    fault: params.get('fault') || 'none',
    survey: params.get('survey') || 'dev',
    pos: params.get('pos') || '',
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retrasos de los fallos "lentos". Son de tiempo real (el reloj falso de Playwright no llega al
// service worker): lo bastante largos para que se note la espera, lo bastante cortos para el CI.
const SLOW_MS = { slow: 4000, 'popups-slow': 3000 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function handle(event, url) {
  const started = Date.now();
  const lab = await labOf(event.clientId);
  const req = event.request;
  const entry = { method: req.method, url: url.href, host: url.hostname, path: url.pathname };

  let response;
  try {
    response = await route(req, url, lab, entry);
  } catch (error) {
    entry.note ??= String(error?.message || error);
    response = Response.error();
  }
  entry.status = response.type === 'error' ? 0 : response.status;
  entry.ms = Date.now() - started;
  lab.client?.postMessage({ type: 'lab:network', entry });
  return response;
}

async function route(req, url, lab, entry) {
  // Nada de esta app puede tocar producción: ni el SDK, ni la encuesta, ni analytics.
  if (PROD_HOSTS.includes(url.hostname)) {
    entry.note = 'blocked: production';
    entry.blocked = true;
    return Response.error();
  }

  // El CDN no responde: el SDK no llega a cargar y la tienda tiene que seguir funcionando.
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/popup-sdk@') && lab.fault === 'sdk-cdn') {
    entry.note = 'fault injected: sdk unreachable';
    return Response.error();
  }

  if (url.hostname === DEV_HOST) {
    const isPopups = /^\/sdk\/[^/]+\/popups$/.test(url.pathname);
    const isSurvey = url.pathname.startsWith('/sdk/app/');
    const isPopupEvent = url.pathname === '/sdk/popups' && req.method === 'POST';
    const isFeedback = url.pathname === '/sdk/feedback';

    if (isPopups && lab.fault === 'popups-slow') {
      entry.note = `fault injected: popups +${SLOW_MS['popups-slow']} ms`;
      await sleep(SLOW_MS['popups-slow']);
    }
    if (isPopups && lab.fault === 'popups-timeout') {
      // La API no contesta nunca: la petición se queda colgada mientras dure el test.
      entry.note = 'fault injected: popups never answer';
      await new Promise(() => {});
    }
    if ((isPopupEvent || isFeedback) && lab.fault === 'events500') {
      entry.note = 'fault injected';
      return json({ error: 'injected' }, 500);
    }
    if (isSurvey && lab.fault === 'slow') {
      entry.note = `fault injected: survey +${SLOW_MS.slow} ms`;
      await sleep(SLOW_MS.slow);
    }
    if (isSurvey && lab.fault === 'survey-garbage') {
      // 200 con un cuerpo que no es JSON: el renderer arranca y se queda a medio pintar.
      entry.note = 'fault injected: invalid body';
      return new Response('<html>upstream proxy error</html>', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (isPopups && lab.fault === 'popups500') {
      entry.note = 'fault injected';
      return json({ error: 'injected' }, 500);
    }
    if (isSurvey && lab.fault === 'survey406') {
      entry.note = 'fault injected';
      return json({ error: { statusCode: 406, message: 'Not Acceptable (injected)' } }, 406);
    }
    if (isSurvey && lab.fault === 'network') {
      entry.note = 'fault injected: network';
      return Response.error();
    }

    // ?survey=fixture: la encuesta sale de app/fixtures/surveys (grabada de DEV con
    // scripts/record-surveys.mjs) y las respuestas se contestan aquí. La regresión de MF-3245 va
    // así para no depender de la red; el smoke y el test de envío siguen yendo a DEV.
    if (lab.survey === 'fixture') {
      const info = /^\/sdk\/app\/([^/]+)\/[^/]+\/info$/.exec(url.pathname);
      if (info) {
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
        const res = await fetch(`/app/fixtures/surveys/${info[1]}.${lang}.json`);
        if (res.ok) {
          // Con `fault=slow` la nota del retraso inyectado se conserva.
          entry.note ??= `fixture: survey ${lang}`;
          return json(await res.json());
        }
      }
      if (isFeedback) {
        entry.note = 'stubbed (fixture survey)';
        return json({ sessionId: 'lab-fixture-session' });
      }
    }

    if (lab.popups === 'fixture') {
      if (isPopups && lab.scenario === 'release-fixtures') {
        const defs = await loadReleaseFixtures();
        entry.note = `fixture: release/compatibility.json (${defs.length})`;
        return json(defs);
      }
      if (isPopups) {
        const scenarios = await loadScenarios();
        const scenario = scenarios.scenarios[lab.scenario] ?? scenarios.scenarios.all;
        let defs = scenario.popups.map((id) => scenarios.popups[id]).filter(Boolean);
        // ?pos=bottom-right…: misma definición en otra posición (regresión de posicionamiento).
        if (lab.pos) defs = defs.map((d) => ({ ...d, style: { ...d.style, position: lab.pos } }));
        entry.note = `fixture: ${lab.scenario} (${defs.length})${lab.pos ? ` pos=${lab.pos}` : ''}`;
        return json(defs);
      }
      // Los estados de popup y el analytics de un popup de fixture no existen en DEV: se
      // contestan aquí para no ensuciar la integración con ids inventados.
      if (isPopupEvent) {
        entry.note = 'stubbed (fixture)';
        return json({ sessionId: null });
      }
      if (isFeedback && !(await isSurveyAnswer(req))) {
        entry.note = 'stubbed (fixture analytics)';
        return json({});
      }
    }
  }

  return fetch(req);
}

// `/sdk/feedback` lo comparten el analytics del popup y las respuestas de la encuesta (las de
// @magicfeedback/native). Las respuestas van a la integración de DEV de verdad: son el dato que
// la prueba tiene que dejar, en la compañía MagicFeedback_DEV.
//
// Una petición es de la encuesta si su `integration` es una de las encuestas de los escenarios.
// Mirar solo si lleva respuestas no basta: el último POST de la encuesta (`completed: true`, el
// que cierra la sesión) va sin respuestas, y contestarlo aquí con `{}` dejaba la encuesta sin
// completar con el error genérico de envío (MF-3245).
async function isSurveyAnswer(req) {
  try {
    const body = await req.clone().json();
    const scenarios = await loadScenarios();
    const surveys = new Set(Object.values(scenarios.popups).map((p) => p.surveyId));
    return surveys.has(body?.integration) || (Array.isArray(body?.feedback?.answers) && body.feedback.answers.length > 0);
  } catch {
    return false;
  }
}
