/**
 * Device info para el context de analytics (Technology #11–13).
 *
 * En Web enviamos `device_type` + `user_agent` crudo y dejamos que el backend
 * derive OS/navegador del UA (como hace GA). Los campos adicionales (timezone,
 * referrer, viewport, etc.) se recogen de las APIs del navegador sin permisos.
 * `country`/`city` se rellenan de forma asíncrona (ver geo-info.ts).
 * En KMP las APIs nativas dan os_version/device_model reales.
 */

import { isbot } from 'isbot';

export interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  os_version?: string;
  device_model?: string;
  app_version?: string;
  user_agent?: string;
  timezone?: string;
  referrer?: string;
  viewport_size?: string;
  screen_resolution?: string;
  pixel_ratio?: number;
  entry_type?: string;
  page_load_ms?: number;
  connection_type?: string;
  country?: string;
  city?: string;
}

export function parseDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' {
  const s = (ua || '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) || (/android/.test(s) && !/mobile/.test(s))) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|windows phone/.test(s) || (/android/.test(s) && /mobile/.test(s))) {
    return 'mobile';
  }
  return 'desktop';
}

function getEntryType(): string | undefined {
  if (typeof performance === 'undefined') return undefined;
  const entries = performance.getEntriesByType('navigation');
  if (!entries.length) return undefined;
  return (entries[0] as PerformanceNavigationTiming).type;
}

function getPageLoadMs(): number | undefined {
  if (typeof performance === 'undefined') return undefined;
  const entries = performance.getEntriesByType('navigation');
  if (!entries.length) return undefined;
  const load = (entries[0] as PerformanceNavigationTiming).loadEventEnd;
  return load > 0 ? Math.round(load) : undefined;
}

function getConnectionType(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (navigator as any).connection?.effectiveType ?? undefined;
}

export function collectDeviceInfo(appVersion?: string): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    device_type: parseDeviceType(ua),
    user_agent: ua || undefined,
    app_version: appVersion,
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
    referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
    viewport_size:
      typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
    screen_resolution:
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : undefined,
    pixel_ratio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
    entry_type: getEntryType(),
    page_load_ms: getPageLoadMs(),
    connection_type: getConnectionType(),
  };
}

/**
 * DD-574: the page runs in a crawler (bingbot, Googlebot, Baidu, PetalBot...) or in a browser
 * driven by automation (`navigator.webdriver`: Selenium, Playwright, Puppeteer, headless
 * crawlers). On bd.dk (nov-2026) crawlers ran the SDK with a new anonymous user on every page:
 * each one became a CRM contact and used up the popup's daily viewer quota before real visitors
 * arrived. In that case `init()` makes no API call at all.
 *
 * React Native has no `navigator.userAgent` nor `webdriver`, so it is never automated here.
 */
export function isAutomatedBrowser(
  nav: { userAgent?: string; webdriver?: boolean } | undefined =
    typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  if (!nav) return false;
  if (nav.webdriver === true) return true;
  const ua = nav.userAgent;
  return typeof ua === 'string' && ua.trim() !== '' && isbot(ua);
}
