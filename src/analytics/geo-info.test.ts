import { describe, it, expect, vi } from 'vitest';
import {
  readCachedGeo,
  writeCachedGeo,
  fetchGeo,
  GEO_STORAGE_KEY,
  GEO_TTL_MS,
  DEFAULT_GEO_PROVIDERS,
  type GeoProvider,
} from './geo-info';
import { InMemoryStorage } from '../tracking/tracking-manager';

/** Respuesta fetch mínima. */
function okJson(data: unknown) {
  return { ok: true, json: async () => data } as unknown as Response;
}
function notOk() {
  return { ok: false, json: async () => ({}) } as unknown as Response;
}

describe('geo cache', () => {
  it('devuelve null cuando no hay nada en storage', () => {
    expect(readCachedGeo(new InMemoryStorage(), 1000)).toBeNull();
  });

  it('roundtrip: write luego read fresco devuelve el geo', () => {
    const s = new InMemoryStorage();
    writeCachedGeo(s, { country: 'ES', city: 'Madrid' }, 1000);
    expect(readCachedGeo(s, 1000 + 5000)).toEqual({ country: 'ES', city: 'Madrid' });
  });

  it('devuelve null cuando la entrada está caducada (más vieja que el TTL)', () => {
    const s = new InMemoryStorage();
    writeCachedGeo(s, { country: 'ES', city: 'Madrid' }, 1000);
    expect(readCachedGeo(s, 1000 + GEO_TTL_MS + 1)).toBeNull();
  });

  it('no lanza y devuelve null con JSON corrupto', () => {
    const s = new InMemoryStorage();
    s.setItem(GEO_STORAGE_KEY, '{not json');
    expect(readCachedGeo(s, 1000)).toBeNull();
  });
});

describe('fetchGeo (cadena de proveedores + timeout)', () => {
  it('devuelve el geo del primer proveedor que responde ok', async () => {
    const providers: GeoProvider[] = [{ url: 'https://p1/', parse: (d) => ({ country: d.cc as string, city: d.c as string }) }];
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ cc: 'ES', c: 'Madrid' }));
    const geo = await fetchGeo({ fetchImpl: fetchImpl as unknown as typeof fetch, providers });
    expect(geo).toEqual({ country: 'ES', city: 'Madrid' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cae al siguiente proveedor cuando el primero responde !ok', async () => {
    const providers: GeoProvider[] = [
      { url: 'https://p1/', parse: (d) => ({ country: d.cc as string }) },
      { url: 'https://p2/', parse: (d) => ({ country: d.cc as string }) },
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(notOk())
      .mockResolvedValueOnce(okJson({ cc: 'FR' }));
    const geo = await fetchGeo({ fetchImpl: fetchImpl as unknown as typeof fetch, providers });
    expect(geo).toEqual({ country: 'FR' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('cae al siguiente proveedor cuando el primero lanza', async () => {
    const providers: GeoProvider[] = [
      { url: 'https://p1/', parse: () => ({ country: 'X' }) },
      { url: 'https://p2/', parse: (d) => ({ country: d.cc as string }) },
    ];
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(okJson({ cc: 'DE' }));
    const geo = await fetchGeo({ fetchImpl: fetchImpl as unknown as typeof fetch, providers });
    expect(geo).toEqual({ country: 'DE' });
  });

  it('devuelve null cuando todos los proveedores fallan', async () => {
    const providers: GeoProvider[] = [
      { url: 'https://p1/', parse: () => null },
      { url: 'https://p2/', parse: () => null },
    ];
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    expect(await fetchGeo({ fetchImpl: fetchImpl as unknown as typeof fetch, providers })).toBeNull();
  });

  it('aborta un proveedor lento por timeout y cae al siguiente', async () => {
    const providers: GeoProvider[] = [
      { url: 'https://slow/', parse: (d) => ({ country: d.cc as string }) },
      { url: 'https://fast/', parse: (d) => ({ country: d.cc as string }) },
    ];
    const fetchImpl = (url: string, init?: { signal?: AbortSignal }) => {
      if (url === 'https://slow/') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return Promise.resolve(okJson({ cc: 'IT' }));
    };
    const geo = await fetchGeo({ fetchImpl: fetchImpl as unknown as typeof fetch, providers, timeoutMs: 10 });
    expect(geo).toEqual({ country: 'IT' });
  });

  it('el primer proveedor por defecto parsea la forma de ipapi.co', () => {
    expect(DEFAULT_GEO_PROVIDERS[0].parse({ country_code: 'ES', city: 'Madrid' })).toEqual({
      country: 'ES',
      city: 'Madrid',
    });
  });
});
