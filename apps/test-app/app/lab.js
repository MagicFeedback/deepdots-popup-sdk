// Estado observable del run: lo pinta el panel de DevTools y lo leen los tests (window.__lab).
//
// Contrato para Playwright (no renombrar sin tocar apps/test-app/e2e):
//   __lab.ready          true cuando el SDK ha hecho init() (o ha fallado su carga: ver sdkError)
//   __lab.sdkVersion     versión exacta cargada ("1.17.1", "1.18.0-local"…)
//   __lab.events[]       { t, kind, name, data } — kind: host | route | sdk | event | error
//   __lab.network[]      { method, url, status, ms, note, blocked }
//   __lab.params         parámetros efectivos del run

const listeners = new Set();
const t0 = performance.now();

export const lab = {
  ready: false,
  sdkVersion: null,
  sdkUrl: null,
  sdkError: null,
  params: null,
  runId: Math.random().toString(16).slice(2, 6),
  events: [],
  network: [],
  sdk: null,

  log(kind, name, data) {
    const entry = { t: Math.round(performance.now() - t0), at: new Date().toISOString(), kind, name, data };
    this.events.push(entry);
    const tail = data === undefined ? '' : ` ${typeof data === 'string' ? data : JSON.stringify(data)}`;
    // Va a la consola con prefijo fijo: es lo que acaba en el log del CI.
    console.info(`[lab] ${kind.padEnd(5)} ${name}${tail}`);
    emit();
  },

  addNetwork(entry) {
    this.network.push({ ...entry, at: new Date().toISOString() });
    if (entry.blocked) this.log('error', 'production request blocked', entry.url);
    emit();
  },

  /** Nombres de los eventos de un tipo, en orden (atajo para los tests). */
  names(kind) {
    return this.events.filter((e) => !kind || e.kind === kind).map((e) => e.name);
  },
};

export function onLabChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let scheduled = false;
function emit() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    listeners.forEach((fn) => fn(lab));
  });
}

window.__lab = lab;
