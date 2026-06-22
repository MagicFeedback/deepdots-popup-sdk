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
