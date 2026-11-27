/**
 * Hosts de desarrollo local (DD-540): ahí el canal de analytics (eventos, crashes, page views)
 * no envía salvo `trackLocalhost: true`, para que el desarrollo local no ensucie el proyecto
 * de producción del host.
 */
export function isLocalDevHost(hostname: string | undefined | null): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    /^127(\.\d{1,3}){3}$/.test(h)
  );
}

/**
 * Páginas de desarrollo o test, y nuestra propia app (DD-574): ahí un navegador automatizado no
 * es un crawler (ninguno visita esos hosts), sino un e2e: los nuestros en localhost y app-dev, y
 * los de clientes en sus entornos de test (Holte, `*.holte.test`). Misma lista que
 * `isDevOrTestPage` de la API (sdk-bot.util.ts): localhost, 127.x, ::1, `*.localhost`, `*.test`,
 * `*.local`, `*.internal`, `*.example`, app.deepdots.com y app-dev.deepdots.com.
 * Más amplia que `isLocalDevHost` a propósito: esa decide si se envían analytics.
 */
export function isDevOrTestHost(hostname: string | undefined | null): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h === '::1' ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    /\.(localhost|test|local|internal|example)$/.test(h) ||
    h === 'app.deepdots.com' ||
    h === 'app-dev.deepdots.com'
  );
}

/** Hostname de la página (web); `undefined` fuera del navegador (React Native, SSR). */
export function currentHostname(): string | undefined {
  try {
    return typeof location !== 'undefined' && typeof location.hostname === 'string' ? location.hostname : undefined;
  } catch {
    return undefined;
  }
}
