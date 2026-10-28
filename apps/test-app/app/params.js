// Parámetros del laboratorio. Todo vive en la query de la URL para que un run sea reproducible
// con un enlace (y para que el service worker lo lea de la pestaña sin estado propio).

export const PARAMS = {
  sdk: { default: 'latest', label: 'SDK', options: ['latest', 'local', '1.17.1', '1.16.1', '1.15.0', '1.14.0'] },
  env: { default: 'dev', label: 'env', options: ['dev'] },
  scenario: {
    default: 'all',
    label: 'scenario',
    options: ['all', 'checkout-time', 'exit-checkout', 'rate-product', 'help-click', 'redisplay', 'not-on-cart', 'scroll-products', 'release-fixtures'],
  },
  popups: { default: 'fixture', label: 'popups', options: ['fixture', 'live'] },
  survey: { default: 'dev', label: 'survey', options: ['dev', 'fixture'] },
  fault: {
    default: 'none',
    label: 'fault',
    options: ['none', 'survey406', 'network', 'popups500', 'sdk-cdn', 'slow', 'popups-slow', 'popups-timeout', 'events500', 'survey-garbage'],
  },
  pos: { default: '', label: 'pos', options: ['', 'center', 'bottom', 'bottom-right', 'bottom-left', 'top', 'top-right', 'top-left'] },
  init: { default: 'once', label: 'init', options: ['once', 'twice'] },
  nav: { default: 'history', label: 'nav', options: ['history', 'silent'] },
  load: { default: 'immediate', label: 'load', options: ['immediate', 'consent', 'delayed'] },
  css: { default: 'competing', label: 'css', options: ['competing', 'clean'] },
  lang: { default: 'es', label: 'lang', options: ['es', 'en'] },
  user: { default: '', label: 'user', options: null },
  debug: { default: '0', label: 'debug', options: ['0', '1'] },
};

/** Valores efectivos: query > valor por defecto. `lang` además recuerda la elección del host. */
export function readParams(search = location.search) {
  const q = new URLSearchParams(search);
  const out = {};
  for (const [key, def] of Object.entries(PARAMS)) {
    out[key] = q.get(key) ?? def.default;
  }
  if (!q.get('lang')) {
    try {
      out.lang = localStorage.getItem('nordly.lang') || out.lang;
    } catch {
      /* storage bloqueado: idioma por defecto */
    }
  }
  return out;
}

/** Query con solo los valores que difieren del defecto (enlaces cortos y legibles). */
export function toQuery(values) {
  const q = new URLSearchParams();
  for (const [key, def] of Object.entries(PARAMS)) {
    const v = values[key];
    if (v !== undefined && v !== '' && v !== def.default) q.set(key, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
