import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { STORAGE_KEYS } from '../tracking/tracking-manager';
import type { PopupDefinition } from '../types';

const DEF: PopupDefinition = {
  id: 'popup-1',
  title: 'T',
  message: '',
  triggers: [{ type: 'event', value: 'evt' }],
  surveyId: 'survey-1',
  productId: 'product-1',
};

function lastPopupEventBody(fetchSpy: ReturnType<typeof vi.fn>): any {
  const call = fetchSpy.mock.calls.find(
    ([url]) => typeof url === 'string' && url.endsWith('/sdk/popups'),
  );
  if (!call) return null;
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe('DeepdotsPopups tracking (Fase 1)', () => {
  let popups: DeepdotsPopups;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    // por defecto la respuesta del backend trae un sessionId
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sessionId: 'srv-1' }) } as any);
    vi.stubGlobal('fetch', fetchSpy);
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates and exposes a stable user_id, persisted under the namespace', () => {
    popups.init({ apiKey: 'k' });
    const uid = popups.getUserId();

    expect(uid).toBeTruthy();
    expect(popups.getUserId()).toBe(uid);
    expect(localStorage.getItem(STORAGE_KEYS.userId)).toBe(uid);
    // el session_id aún no existe hasta que el backend lo provea
    expect(popups.getSessionId()).toBeNull();
  });

  it('arranca DESACTIVADO con trackingEnabled:false y se reactiva en runtime', () => {
    popups.init({ apiKey: 'k', trackingEnabled: false });
    expect(popups.getUserId()).toBeNull();
    expect(popups.getSessionId()).toBeNull();
    popups.track('x');
    expect(popups.previewAnalytics().events).toHaveLength(0);

    popups.setTrackingEnabled(true);
    expect(popups.getUserId()).toBeTruthy();
  });

  it('uses the client-provided userId without persisting one', () => {
    popups.init({ apiKey: 'k', userId: 'host-42' });
    expect(popups.getUserId()).toBe('host-42');
    expect(localStorage.getItem(STORAGE_KEYS.userId)).toBeNull();
  });

  it('does NOT send sessionId in the event body (backend owns it)', () => {
    popups.init({ apiKey: 'k' });
    popups.show(DEF);

    const body = lastPopupEventBody(fetchSpy);
    expect(body).toMatchObject({ status: 'SHOWED', popupId: 'popup-1' });
    expect(body.sessionId).toBeUndefined();
  });

  it('caches the sessionId returned by the backend response', async () => {
    popups.init({ apiKey: 'k' });
    expect(popups.getSessionId()).toBeNull();

    popups.show(DEF); // dispara popup_shown → POST → respuesta { sessionId: 'srv-1' }
    await new Promise((r) => setTimeout(r, 0)); // deja resolver la promesa del fetch

    expect(popups.getSessionId()).toBe('srv-1');
  });

  it('with tracking disabled, still reports the popup and keeps session null', () => {
    popups.init({ apiKey: 'k' });
    popups.setTrackingEnabled(false);

    expect(popups.getSessionId()).toBeNull();
    popups.show(DEF);

    const body = lastPopupEventBody(fetchSpy);
    expect(body.status).toBe('SHOWED');
    expect(body.popupId).toBe('popup-1');
    expect(body.sessionId).toBeUndefined();
  });
});
