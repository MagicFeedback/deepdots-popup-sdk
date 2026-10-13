import { vi } from 'vitest';
import type { PopupDefinition } from '../types';

/**
 * Helper SOLO para tests: los popups ahora se reciben SIEMPRE de la API, así que para
 * probar comportamiento de popups stubeamos `fetch`:
 *  - GET  /sdk/{apiKey}/popups  → devuelve `defs`
 *  - POST /sdk/popups (eventos)  → devuelve { sessionId }
 * (No es API pública del SDK; el host ya no define popups en init.)
 */
export function mockPopupsApi(defs: PopupDefinition[] = [], sessionId = 'srv-test') {
  const fetchMock = vi.fn(async (_url: unknown, opts?: { method?: string }) => {
    if (opts?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ sessionId }), text: async () => JSON.stringify({ sessionId }) } as unknown as Response;
    }
    // GET de definiciones de popups
    return { ok: true, status: 200, text: async () => JSON.stringify(defs), json: async () => defs } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Espera a que init() resuelva la carga asíncrona de popups desde la API. */
export function flushPopupsLoad(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Como `mockPopupsApi`, pero el GET de definiciones no responde hasta que el test llama a
 * `release()` (o `fail()`, que simula un error de red). Sirve para disparar eventos mientras
 * la carga de `init()` está en vuelo.
 */
export function mockPopupsApiDeferred(defs: PopupDefinition[] = [], sessionId = 'srv-test') {
  let resolveGet!: (r: Response) => void;
  let rejectGet!: (e: unknown) => void;
  const pendingGet = new Promise<Response>((resolve, reject) => {
    resolveGet = resolve;
    rejectGet = reject;
  });
  const fetchMock = vi.fn(async (_url: unknown, opts?: { method?: string }) => {
    if (opts?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ sessionId }), text: async () => JSON.stringify({ sessionId }) } as unknown as Response;
    }
    return pendingGet;
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    /** Responde el GET con las definiciones y espera a que init() las procese. */
    async release(): Promise<void> {
      resolveGet({ ok: true, status: 200, text: async () => JSON.stringify(defs), json: async () => defs } as unknown as Response);
      await flushPopupsLoad();
    },
    /** El GET falla (error de red) y espera a que init() lo procese. */
    async fail(): Promise<void> {
      rejectGet(new Error('network down'));
      await flushPopupsLoad();
    },
  };
}
