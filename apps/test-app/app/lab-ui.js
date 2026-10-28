// UI del laboratorio: barra "SDK Lab" arriba y panel tipo DevTools abajo (Events, Network,
// Config, Storage). Va aparte de la tienda y con su propio CSS acotado a #lab-*, para que ni el
// CSS del host ni el del popup la toquen (ni ella a ellos).

import { lab, onLabChange } from './lab.js';
import { PARAMS } from './params.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TOOLBAR_SELECTS = ['sdk', 'scenario', 'popups', 'fault', 'nav', 'load', 'css'];
const TABS = ['events', 'network', 'config', 'storage'];

export function mountLabUi({ toolbar, devtools, params, apply, reset }) {
  const sel = (key) => {
    const def = PARAMS[key];
    const opts = def.options.includes(params[key]) ? def.options : [params[key], ...def.options];
    return `<label class="lab-field"><span>${esc(def.label)}</span><select data-param="${key}" data-testid="lab-${key}">
      ${opts.map((o) => `<option value="${esc(o)}"${o === params[key] ? ' selected' : ''}>${esc(o)}</option>`).join('')}
    </select></label>`;
  };

  toolbar.innerHTML = `
    <div class="lab-bar">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7aa2ff" stroke-width="2"><circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/></svg>
      <strong>SDK Lab</strong>
      <span class="lab-dim">/ popup-sdk</span>
      <span class="lab-version" data-testid="lab-version">loading…</span>
      <span class="lab-env" data-testid="lab-env">DEV · api-dev.deepdots.com</span>
      ${params.fault !== 'none' ? `<span class="lab-fault">fault: ${esc(params.fault)}</span>` : ''}
      <details class="lab-config">
        <summary data-testid="lab-configure">Configure</summary>
        <form class="lab-form">
          ${TOOLBAR_SELECTS.map(sel).join('')}
          <label class="lab-field"><span>user</span><input data-param="user" value="${esc(params.user)}" placeholder="anonymous" size="10"></label>
          <button type="submit" class="lab-btn lab-primary" data-testid="lab-apply">Apply &amp; reload</button>
        </form>
      </details>
      <span class="lab-grow"></span>
      <span class="lab-dim lab-mono" data-testid="lab-run">run ${lab.runId}</span>
      <button type="button" class="lab-btn" data-action="reset" data-testid="lab-reset" title="Clear localStorage (cooldowns, cart, consent) and reload">Reset</button>
      <button type="button" class="lab-btn lab-primary" data-action="reload">Reload</button>
    </div>`;

  toolbar.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const values = { ...params };
    toolbar.querySelectorAll('[data-param]').forEach((el) => (values[el.dataset.param] = el.value.trim()));
    apply(values);
  });
  toolbar.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'reset') reset();
    if (action === 'reload') location.reload();
  });

  let tab = 'events';
  let collapsed = false;
  try {
    tab = sessionStorage.getItem('lab.tab') || tab;
    collapsed = sessionStorage.getItem('lab.collapsed') === '1';
  } catch {
    /* ignore */
  }

  devtools.innerHTML = `
    <div class="lab-tabs" role="tablist">
      ${TABS.map((t) => `<button type="button" role="tab" data-tab="${t}" data-testid="lab-tab-${t}"></button>`).join('')}
      <span class="lab-grow"></span>
      <span class="lab-dim lab-status" data-testid="lab-status"></span>
      <button type="button" class="lab-btn lab-icon" data-collapse aria-label="Toggle panel">▾</button>
    </div>
    <div class="lab-body" data-testid="lab-body"></div>`;

  const body = devtools.querySelector('.lab-body');
  devtools.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]')?.dataset.tab;
    if (t) {
      tab = t;
      collapsed = false;
    }
    if (e.target.closest('[data-collapse]')) collapsed = !collapsed;
    try {
      sessionStorage.setItem('lab.tab', tab);
      sessionStorage.setItem('lab.collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    render();
  });

  function render() {
    const version = toolbar.querySelector('[data-testid="lab-version"]');
    version.textContent = lab.sdkVersion ? `${lab.sdkVersion} · ${params.sdk === 'local' ? 'local dist' : 'npm'}` : lab.sdkError ? 'sdk failed' : `${params.sdk} · loading…`;
    version.classList.toggle('lab-bad', Boolean(lab.sdkError));

    const errors = lab.network.filter((n) => n.status === 0 || n.status >= 400).length;
    const counts = { events: lab.events.length, network: lab.network.length, config: '', storage: '' };
    devtools.querySelectorAll('[data-tab]').forEach((b) => {
      const t = b.dataset.tab;
      b.setAttribute('aria-selected', String(t === tab && !collapsed));
      b.innerHTML = `${t[0].toUpperCase()}${t.slice(1)} <span class="lab-dim">${counts[t]}</span>${t === 'network' && errors ? ` <span class="lab-bad">· ${errors} err</span>` : ''}`;
    });
    const prod = lab.network.filter((n) => n.blocked).length;
    devtools.querySelector('[data-testid="lab-status"]').textContent =
      `nav: ${params.nav} · load: ${params.load} · lang: ${params.lang} · popups: ${params.popups} · prod calls: ${prod}`;
    devtools.classList.toggle('lab-collapsed', collapsed);
    if (collapsed) return;

    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
    body.innerHTML = VIEWS[tab]();
    if (atBottom) body.scrollTop = body.scrollHeight;
  }

  const VIEWS = {
    events: () => lab.events.map((e) => `
      <div class="lab-row"><span class="lab-dim">${(e.t / 1000).toFixed(3).padStart(8)}</span>
      <span class="lab-kind lab-k-${e.kind}">${e.kind}</span>
      <span>${esc(e.name)}${e.data === undefined ? '' : ` <span class="lab-dim">${esc(typeof e.data === 'string' ? e.data : JSON.stringify(e.data))}</span>`}</span></div>`).join(''),
    network: () => `
      <div class="lab-row lab-dim lab-head"><span>STATUS</span><span>METHOD</span><span>URL</span><span>TIME</span></div>
      ${lab.network.map((n) => `
        <div class="lab-row lab-net ${n.status === 0 || n.status >= 400 ? 'lab-bad' : ''}">
          <span>${n.status || 'ERR'}</span><span>${esc(n.method)}</span>
          <span class="lab-url" title="${esc(n.url)}">${esc(n.host + n.path)}${n.note ? ` <span class="lab-dim">(${esc(n.note)})</span>` : ''}</span>
          <span>${n.ms} ms</span></div>`).join('')}`,
    config: () => `<pre class="lab-pre">${esc(JSON.stringify({
      sdkVersion: lab.sdkVersion,
      sdkUrl: lab.sdkUrl,
      params,
      init: { nodeEnv: 'development', language: params.lang, geolocation: false, userId: params.user || '(sdk anonymous id)' },
    }, null, 2))}</pre>`,
    storage: () => {
      const rows = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          rows.push([k, localStorage.getItem(k)]);
        }
      } catch {
        /* ignore */
      }
      rows.sort(([a], [b]) => a.localeCompare(b));
      return rows.map(([k, v]) => `<div class="lab-row"><span class="lab-key">${esc(k)}</span><span class="lab-dim lab-url">${esc(v)}</span></div>`).join('') || '<span class="lab-dim">empty</span>';
    },
  };

  onLabChange(render);
  render();
}
