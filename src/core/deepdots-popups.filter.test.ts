import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { flushPopupsLoad } from './test-helpers';

/**
 * El backend aplica las reglas de redisplay EN EL GET: si el `userId` del filtro ya
 * tiene un SHOWED/PARTIAL/COMPLETED dentro del cooldown, no devuelve ese popup
 * (verificado contra api.deepdots.com). Para que eso funcione, el id por el que se
 * PREGUNTA tiene que ser el mismo por el que se REPORTA — que es el del tracking.
 */
function mockApi() {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (url: unknown, opts?: { method?: string; body?: string }) => {
    const href = String(url);
    if (opts?.method === 'POST') {
      if (href.includes('/sdk/popups')) urls.push(`POST ${href} ${opts.body ?? ''}`);
      return { ok: true, status: 200, json: async () => ({ sessionId: 's' }), text: async () => '{"sessionId":"s"}' } as unknown as Response;
    }
    if (href.includes('/popups')) urls.push(`GET ${href}`);
    return { ok: true, status: 200, text: async () => '[]', json: async () => [] } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return urls;
}

/** Saca el userId del `?filter={"where":{"userId":...}}` del GET de popups. */
function filterUserId(url: string): string | null {
  const raw = new URL(url.replace(/^GET /, '')).searchParams.get('filter');
  if (!raw) return null;
  return JSON.parse(raw)?.where?.userId ?? null;
}

describe('GET /sdk/{key}/popups · userId del filtro', () => {
  beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('sin userId del host, filtra por el user_id persistente del SDK', async () => {
    const urls = mockApi();
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({ apiKey: 'k', storage: new InMemoryStorage() });
    await flushPopupsLoad();

    const get = urls.find((u) => u.startsWith('GET'));
    expect(get).toBeDefined();
    // Antes se mandaba SIN filtro: el backend devolvia todo y no podia aplicar el cooldown.
    expect(filterUserId(get as string)).toBe(popups.getUserId());
    expect(popups.getUserId()).toBeTruthy();
  });

  it('el id por el que pregunta es el MISMO por el que reporta el estado', async () => {
    const urls = mockApi();
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({ apiKey: 'k', storage: new InMemoryStorage() });
    await flushPopupsLoad();

    // Un POST de estado con el mismo popup que luego pediremos filtrado.
    popups.markSurveyAnswered('survey-x');
    (popups as unknown as { emitEvent: (t: string, s: string, d?: unknown) => void })
      .emitEvent('popup_shown', 'survey-x', { popupId: 'popup-x' });
    await flushPopupsLoad();

    const askedAs = filterUserId(urls.find((u) => u.startsWith('GET')) as string);
    const post = urls.find((u) => u.startsWith('POST'));
    expect(post).toBeDefined();
    const reportedAs = JSON.parse((post as string).replace(/^POST \S+ /, '')).userId;

    expect(askedAs).toBe(reportedAs);
  });

  it('con userId del host, el filtro usa ese', async () => {
    const urls = mockApi();
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({ apiKey: 'k', userId: 'host-user-42', storage: new InMemoryStorage() });
    await flushPopupsLoad();

    expect(filterUserId(urls.find((u) => u.startsWith('GET')) as string)).toBe('host-user-42');
  });
});
