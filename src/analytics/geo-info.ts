/**
 * Geolocalización por IP (Option B: client-side) robusta.
 *
 * Robustez:
 *  - CACHE persistente en `KeyValueStorage` con TTL: en arranques posteriores el país/ciudad
 *    está disponible de inmediato (sin llamada, sin gap de timing) y ahorra cuota del proveedor.
 *  - CADENA de proveedores con fallback: si uno está bloqueado (ad-blocker), rate-limited (429)
 *    o caído, se prueba el siguiente.
 *  - TIMEOUT por proveedor vía `AbortController` para no colgarse en uno lento.
 *
 * Todo es fire-and-forget y tolerante a fallos: ante cualquier error devuelve `null`.
 */

import type { KeyValueStorage } from '../tracking/tracking-manager';

export interface GeoInfo {
  country?: string;
  city?: string;
}

/** Clave de cache en storage. */
export const GEO_STORAGE_KEY = 'deepdots.geo';
/** El país/ciudad casi no cambian: cache de 30 días. */
export const GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Timeout por proveedor. */
export const GEO_TIMEOUT_MS = 3000;

interface CachedGeo extends GeoInfo {
  ts: number;
}

/** Lee el geo cacheado si sigue fresco (no supera el TTL). Tolerante a JSON corrupto. */
export function readCachedGeo(storage: KeyValueStorage, now: number): GeoInfo | null {
  try {
    const raw = storage.getItem(GEO_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedGeo;
    if (typeof cached.ts !== 'number' || now - cached.ts > GEO_TTL_MS) return null;
    const geo: GeoInfo = {};
    if (cached.country) geo.country = cached.country;
    if (cached.city) geo.city = cached.city;
    return geo.country || geo.city ? geo : null;
  } catch {
    return null;
  }
}

/** Persiste el geo con la marca de tiempo actual. Tolerante a fallos de storage. */
export function writeCachedGeo(storage: KeyValueStorage, geo: GeoInfo, now: number): void {
  try {
    const payload: CachedGeo = { ...geo, ts: now };
    storage.setItem(GEO_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage lleno / no disponible: se ignora */
  }
}

export interface GeoProvider {
  url: string;
  parse: (data: Record<string, unknown>) => GeoInfo | null;
}

/** Proveedores en orden de preferencia. Todos devuelven JSON sin auth. */
export const DEFAULT_GEO_PROVIDERS: GeoProvider[] = [
  {
    // https://ipapi.co/json/
    url: 'https://ipapi.co/json/',
    parse: (d) => geoFrom(d.country_code, d.city),
  },
  {
    // https://ipwho.is/ (devuelve success:false con 200 en errores)
    url: 'https://ipwho.is/',
    parse: (d) => (d.success === false ? null : geoFrom(d.country_code, d.city)),
  },
  {
    // https://ipinfo.io/json (country = código ISO)
    url: 'https://ipinfo.io/json',
    parse: (d) => geoFrom(d.country, d.city),
  },
];

function geoFrom(country: unknown, city: unknown): GeoInfo | null {
  const c = typeof country === 'string' && country ? country : undefined;
  const t = typeof city === 'string' && city ? city : undefined;
  if (!c && !t) return null;
  return { country: c, city: t };
}

async function fetchOne(provider: GeoProvider, f: typeof fetch, timeoutMs: number): Promise<GeoInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await f(provider.url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return provider.parse(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchGeoOptions {
  fetchImpl?: typeof fetch;
  providers?: GeoProvider[];
  timeoutMs?: number;
}

/**
 * Intenta cada proveedor en orden (con timeout) y devuelve el primer geo válido.
 * `null` si ninguno responde. No lanza.
 */
export async function fetchGeo(options: FetchGeoOptions = {}): Promise<GeoInfo | null> {
  const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!f) return null;
  const providers = options.providers ?? DEFAULT_GEO_PROVIDERS;
  const timeoutMs = options.timeoutMs ?? GEO_TIMEOUT_MS;
  for (const provider of providers) {
    const geo = await fetchOne(provider, f, timeoutMs);
    if (geo) return geo;
  }
  return null;
}
