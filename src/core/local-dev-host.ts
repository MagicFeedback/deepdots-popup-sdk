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

/** Hostname de la página (web); `undefined` fuera del navegador (React Native, SSR). */
export function currentHostname(): string | undefined {
  try {
    return typeof location !== 'undefined' && typeof location.hostname === 'string' ? location.hostname : undefined;
  } catch {
    return undefined;
  }
}
