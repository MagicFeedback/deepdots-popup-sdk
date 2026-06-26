/**
 * Geolocalización por IP vía ipapi.co (Option B: client-side).
 * Fire-and-forget: se llama en init() y rellena country/city en el DeviceInfo
 * cuando resuelve. Tolerante a fallos (ad-blockers, rate-limit, red).
 */

export interface GeoInfo {
  country?: string;
  city?: string;
}

export async function collectGeoInfo(fetchImpl?: typeof fetch): Promise<GeoInfo | null> {
  const f = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!f) return null;
  try {
    const res = await f('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const country = (data.country_code as string) || undefined;
    const city = (data.city as string) || undefined;
    if (!country && !city) return null;
    return { country, city };
  } catch {
    return null;
  }
}
