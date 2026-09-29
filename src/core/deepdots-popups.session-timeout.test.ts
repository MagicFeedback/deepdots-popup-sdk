import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';

/**
 * Latido y timeout de sesión del canal de analytics (web).
 *
 * El backend (Run_Jobs `incomplete-surveys`) cierra una sesión que lleva 60 min sin recibir
 * ningún lote. Antes del latido, alguien leyendo una sola página no enviaba nada — el
 * page_view sale al salir de la pantalla, el engagement al ocultar/cerrar — y la sesión se
 * cerraba con solo su session_start ("0 páginas, 0 segundos"); lo demás llegaba después con
 * el mismo sessionId como un segundo fragmento.
 */

const MIN = 60_000;

type Body = {
  sessionId?: string;
  completed: boolean;
  integration: string;
  feedback: { metadata: Array<{ key: string; value: string[] }> };
};

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function eventsOf(body: Body) {
  return body.feedback.metadata
    .filter((e) => e.key.startsWith('deepdots_') && e.value?.[0]?.startsWith('{'))
    .map((e) => ({ name: e.key, ...JSON.parse(e.value[0]) }));
}

describe('analytics session heartbeat and timeout', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let bodies: (integration?: string) => Body[];

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    // Cada integración numera sus registros: <integración>:1, y tras un cierre <integración>:2…
    const opened = new Map<string, number>();
    fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      if (!body.sessionId) opened.set(body.integration, (opened.get(body.integration) ?? 0) + 1);
      const id = body.sessionId ?? `${body.integration}:${opened.get(body.integration)}`;
      return { ok: true, json: async () => ({ sessionId: id }) };
    });
    vi.stubGlobal('fetch', fetchSpy);
    bodies = (integration = 'int-session') =>
      fetchSpy.mock.calls
        .filter(([u]) => typeof u === 'string' && (u as string).endsWith('/sdk/feedback'))
        .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body)
        .filter((b) => b.integration === integration);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Las instancias de tests anteriores siguen escuchando `pagehide` en el mismo window: un
  // test que cierra la pestaña usa su propia integración para contar solo sus lotes.
  const start = (integration = 'int-session') => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      analytics: { publicKey: 'pub-a', integration },
    });
    return sdk;
  };

  const engagementPosts = () =>
    bodies().filter((b) => eventsOf(b).some((e) => e.name === 'deepdots_user_engagement'));

  it('a visible tab sends its engagement every 5 minutes, so the session never looks idle', async () => {
    start();
    await vi.advanceTimersByTimeAsync(4.5 * MIN);
    expect(engagementPosts()).toHaveLength(0); // no más de un latido cada 5 min

    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(engagementPosts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(engagementPosts()).toHaveLength(2);

    const total = engagementPosts()
      .flatMap(eventsOf)
      .filter((e) => e.name === 'deepdots_user_engagement')
      .reduce((ms, e) => ms + e.engagement_time_msec, 0);
    expect(total).toBeGreaterThanOrEqual(10 * MIN);
    expect(bodies().every((b) => !b.completed)).toBe(true);
    expect(new Set(bodies().map((b) => b.sessionId ?? 'int-session:1'))).toEqual(new Set(['int-session:1']));
  });

  it('a hidden tab sends no heartbeat', async () => {
    start();
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('hidden');
    const before = engagementPosts().length; // el engagement del momento de ocultarse
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(engagementPosts()).toHaveLength(before);
  });

  it('coming back within 30 minutes keeps the same session', async () => {
    start();
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10 * MIN);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(bodies().some((b) => b.completed)).toBe(false);
    expect(bodies().flatMap(eventsOf).filter((e) => e.name === 'deepdots_session_start')).toHaveLength(1);
  });

  it('after 30–50 minutes hidden it closes the old session and opens a new one', async () => {
    start();
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(40 * MIN);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(30_000);

    const closing = bodies().find((b) => b.completed);
    expect(closing?.sessionId).toBe('int-session:1');
    const closed = eventsOf(closing as Body);
    expect(closed.find((e) => e.name === 'deepdots_session_end')?.reason).toBe('idle_timeout');
    expect(closed.some((e) => e.name === 'deepdots_page_view')).toBe(true);

    const after = bodies().slice(bodies().indexOf(closing as Body) + 1);
    expect(after[0].sessionId).toBeUndefined(); // registro nuevo
    expect(eventsOf(after[0]).some((e) => e.name === 'deepdots_session_start')).toBe(true);
  });

  it('after 50+ minutes hidden it drops the old session without posting to it', async () => {
    start();
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('hidden');
    const sentBefore = bodies().length;
    await vi.advanceTimersByTimeAsync(55 * MIN);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(30_000);

    const after = bodies().slice(sentBefore);
    expect(after.some((b) => b.completed)).toBe(false);
    expect(after.some((b) => b.sessionId === 'int-session:1')).toBe(false);
    expect(after.flatMap(eventsOf).some((e) => e.name === 'deepdots_session_end')).toBe(false);
    expect(eventsOf(after[0]).some((e) => e.name === 'deepdots_session_start')).toBe(true);
    expect(after[0].sessionId).toBeUndefined();
  });

  it('closing the tab after a rotation closes the new session, not the old one', async () => {
    start('int-session-close');
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(55 * MIN);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    const closings = bodies('int-session-close').filter((b) => b.completed);
    expect(closings).toHaveLength(1);
    expect(closings[0].sessionId).toBe('int-session-close:2');
  });
});
