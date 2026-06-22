/**
 * Device info para el context de analytics (Technology #11–13).
 *
 * En Web enviamos `device_type` (heurística fiable) + `user_agent` crudo, y dejamos
 * que el backend derive OS/modelo/navegador del UA (como hace GA) — el parseo de UA en
 * cliente es frágil. `app_version` lo provee el cliente (una web no tiene versión de app
 * nativa). En KMP las APIs nativas dan os_version/device_model reales.
 */

export interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  os_version?: string;
  device_model?: string;
  app_version?: string;
  user_agent?: string;
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

export function collectDeviceInfo(appVersion?: string): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    device_type: parseDeviceType(ua),
    user_agent: ua || undefined,
    app_version: appVersion,
  };
}
