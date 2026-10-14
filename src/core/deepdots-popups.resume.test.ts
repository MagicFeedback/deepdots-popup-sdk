import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { SUSPENDED_SESSION_KEY } from '../analytics/suspended-session';

/**
 * Recargar la página no parte la sesión de analytics.
 *
 * El navegador lanza `pagehide` igual al recargar (Cmd+R / F5) que al cerrar la pestaña. El
 * SDK cerraba la sesión ahí (`completed:true`) y la carga siguiente abría otra: cada recarga
 * eran dos feedbacks y dos mensajes en Slack. Ahora el `pagehide` la SUSPENDE y la carga
 * siguiente de la misma pestaña sigue en el mismo registro. Una pestaña cerrada de verdad la
 * cierra el backend (Run_Jobs `incomplete-surveys`) al ver el `deepdots_session_suspend`.
 */

type Body = {
  sessionId?: string;
  completed: boolean;
  integration: string;
  feedback: { metadata: Array<{ key: string; value: string[] }> };
};

function eventsOf(body: Body) {
  return body.feedback.metadata
    .filter((e) => e.key.startsWith('deepdots_') && e.value?.[0]?.startsWith('{'))
    .map((e) => ({ name: e.key, ...JSON.parse(e.value[0]) }));
}

const names = (body: Body) => eventsOf(body).map((e) => e.name);
const startReason = (body: Body) => eventsOf(body).find((e) => e.name === 'deepdots_session_start')?.reason;

describe('analytics session survives a page reload', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  /** Si es false, la API no devuelve sessionId (el primer POST "sigue en vuelo"). */
  let answerWithSessionId: boolean;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.clear();
    sessionStorage.clear();
    answerWithSessionId = true;
    // Cada integración numera sus registros: <integración>:1, y tras un cierre <integración>:2…
    const opened = new Map<string, number>();
    fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      if (!body.sessionId) opened.set(body.integration, (opened.get(body.integration) ?? 0) + 1);
      const id = body.sessionId ?? `${body.integration}:${opened.get(body.integration)}`;
      return { ok: true, json: async () => (answerWithSessionId ? { sessionId: id } : {}) };
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const bodies = (integration: string) =>
    fetchSpy.mock.calls
      .filter(([u]) => typeof u === 'string' && (u as string).endsWith('/sdk/feedback'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body)
      .filter((b) => b.integration === integration);

  const settle = () => new Promise((r) => setTimeout(r, 0));

  /** Una "carga" de la página: instancia nueva (las anteriores siguen escuchando `pagehide`). */
  const load = (integration: string, userId?: string) => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1', nodeEnv: 'development', userId, analytics: { publicKey: 'pub-a', integration } });
    return sdk;
  };

  /** Carga y manda el primer lote, para que el SDK conozca su registro. */
  const loadWithRecord = async (integration: string, userId?: string) => {
    const sdk = load(integration, userId);
    sdk.flushAnalytics();
    await settle();
    return sdk;
  };

  it('pagehide suspends the session instead of closing it', async () => {
    const sdk = await loadWithRecord('int-suspend');
    sdk.track('cta_click');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    const last = bodies('int-suspend').at(-1)!;
    expect(last.completed).toBe(false);
    expect(last.sessionId).toBe('int-suspend:1');
    expect(names(last)).toEqual(expect.arrayContaining(['deepdots_event_cta_click', 'deepdots_session_suspend']));
    expect(names(last)).not.toContain('deepdots_session_end');
    expect(eventsOf(last).find((e) => e.name === 'deepdots_session_suspend')?.reason).toBe('page_hide');
    expect(bodies('int-suspend').some((b) => b.completed)).toBe(false);
  });

  it('the next load in the same tab carries on in the same record, without a new session_start', async () => {
    await loadWithRecord('int-reload');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    vi.setSystemTime(Date.now() + 2_000); // la recarga tarda un par de segundos
    const onFeedbackSession = vi.fn();
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration: 'int-reload' },
      onFeedbackSession,
    });
    sdk.track('after_reload');
    sdk.flushAnalytics();
    await settle();

    const afterReload = bodies('int-reload').at(-1)!;
    expect(afterReload.sessionId).toBe('int-reload:1');
    expect(afterReload.completed).toBe(false);
    expect(names(afterReload)).toContain('deepdots_session_resume');
    expect(names(afterReload)).not.toContain('deepdots_session_start');
    expect(eventsOf(afterReload).find((e) => e.name === 'deepdots_session_resume')?.suspended_ms).toBe(2_000);
    // Ningún lote abrió un registro nuevo: todos los posteriores al primero van al mismo.
    expect(bodies('int-reload').slice(1).every((b) => b.sessionId === 'int-reload:1')).toBe(true);
    expect(sdk.getFeedbackSessionId()).toBe('int-reload:1');
    expect(onFeedbackSession).toHaveBeenCalledWith({ sessionId: 'int-reload:1', status: 'open' });
    expect(sessionStorage.getItem(SUSPENDED_SESSION_KEY)).toBeNull();
  });

  it('a session resumed after a reload still closes normally', async () => {
    await loadWithRecord('int-reload-close');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    const sdk = load('int-reload-close');
    sdk.endSession();
    await settle();

    const closings = bodies('int-reload-close').filter((b) => b.completed);
    expect(closings).toHaveLength(1);
    expect(closings[0].sessionId).toBe('int-reload-close:1');
    expect(names(closings[0])).toContain('deepdots_session_end');
  });

  it('a load more than a minute later starts a new session', async () => {
    await loadWithRecord('int-late');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    vi.setSystemTime(Date.now() + 61_000);
    const sdk = load('int-late');
    sdk.flushAnalytics();
    await settle();

    const first = bodies('int-late').at(-1)!;
    expect(first.sessionId).toBeUndefined();
    expect(names(first)).toContain('deepdots_session_start');
    expect(startReason(first)).toBe('cold_start');
    expect(names(first)).not.toContain('deepdots_session_resume');
    expect(sessionStorage.getItem(SUSPENDED_SESSION_KEY)).toBeNull();
  });

  it('another user or another integration does not inherit the suspended session', async () => {
    await loadWithRecord('int-owner', 'user-a');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    const sdk = load('int-owner', 'user-b');
    sdk.flushAnalytics();
    await settle();
    const otherUser = bodies('int-owner').at(-1)!;
    expect(otherUser.sessionId).toBeUndefined();
    expect(names(otherUser)).toContain('deepdots_session_start');
    expect(startReason(otherUser)).toBe('cold_start');

    await loadWithRecord('int-one');
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    const other = load('int-two');
    other.flushAnalytics();
    await settle();
    expect(bodies('int-two')[0].sessionId).toBeUndefined();
  });

  it('closes as before when the record is not known yet at pagehide', async () => {
    answerWithSessionId = false; // el primer POST no ha devuelto el sessionId
    load('int-unknown');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    const posts = bodies('int-unknown');
    expect(posts).toHaveLength(1);
    expect(posts[0].completed).toBe(true);
    expect(names(posts[0])).toContain('deepdots_session_end');
    // Las instancias de tests anteriores también reciben este `pagehide` y suspenden la suya.
    expect(sessionStorage.getItem(SUSPENDED_SESSION_KEY) ?? '').not.toContain('int-unknown');
  });

  it('back from the bfcache resumes the suspended session, and suspends it again on leaving', async () => {
    const sdk = await loadWithRecord('int-bfcache-resume');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    vi.setSystemTime(Date.now() + 5_000);
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    sdk.track('back_again');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    const posts = bodies('int-bfcache-resume');
    expect(posts.every((b) => !b.completed)).toBe(true);
    expect(posts.slice(1).every((b) => b.sessionId === 'int-bfcache-resume:1')).toBe(true);
    const last = posts.at(-1)!;
    expect(names(last)).toEqual(
      expect.arrayContaining(['deepdots_session_resume', 'deepdots_event_back_again', 'deepdots_session_suspend'])
    );
    expect(names(last)).not.toContain('deepdots_session_start');
  });

  it('back from the bfcache too late opens a new session in a new record', async () => {
    const sdk = await loadWithRecord('int-bfcache-late');
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    vi.setSystemTime(Date.now() + 5 * 60_000);
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    sdk.flushAnalytics();
    await settle();

    const last = bodies('int-bfcache-late').at(-1)!;
    expect(last.sessionId).toBeUndefined();
    expect(names(last)).toContain('deepdots_session_start');
    expect(startReason(last)).toBe('bfcache_restore');
  });
});
