import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

/**
 * React Native: volver de background en menos de 5 min es la MISMA sesión.
 *
 * Salir a firmar en otra app y volver, o mirar una notificación, partía la visita en dos
 * sesiones: en una app en producción (nov-2026) un tercio de las sesiones eran una vuelta en
 * menos de 2 min. Ahora `onBackground` suspende y `onForeground` reanuda dentro de la ventana;
 * fuera de ella abre otra sesión y la anterior la cierra el backend (Run_Jobs
 * `incomplete-surveys`, `SUSPEND_GRACE_MINUTES` = 8).
 */

const MIN = 60_000;

type Body = {
  sessionId?: string;
  completed?: boolean;
  integration: string;
  feedback: { metadata: { key: string; value: string[] }[] };
};

const eventsOf = (b: Body) =>
  b.feedback.metadata
    .filter((m) => m.value[0]?.startsWith('{'))
    .map((m) => ({ name: m.key, ...(JSON.parse(m.value[0]) as Record<string, unknown>) }));

describe('React Native: vuelta de background dentro de 5 min', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const okFetch = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Body;
    return { ok: true, json: async () => ({ sessionId: body.sessionId }), text: async () => '' };
  };
  const settle = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    localStorage.clear();
    sessionStorage.clear();
    fetchSpy = vi.fn().mockImplementation(okFetch);
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const bodies = (): Body[] =>
    fetchSpy.mock.calls
      .filter(([u]) => String(u).endsWith('/sdk/feedback'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body);
  const events = () => bodies().flatMap((b) => eventsOf(b).map((e) => ({ ...e, sessionId: b.sessionId })));

  /** SDK de RN con el registro ya abierto (el primer lote salió y volvió). */
  const started = async (extra: Partial<Parameters<DeepdotsPopups['init']>[0]> = {}) => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      platform: 'android',
      storage: new InMemoryStorage(),
      analytics: { publicKey: 'pub-a', integration: 'int-bg' },
      ...extra,
    });
    sdk.setScreen('/login');
    sdk.flushAnalytics();
    await settle();
    return sdk;
  };

  it('vuelve en menos de 5 min: sigue en el mismo registro, con resume y sin otro session_start', async () => {
    const sdk = await started();
    const record = bodies()[0].sessionId;

    sdk.onBackground(); // sale a firmar en otra app
    await settle();
    vi.advanceTimersByTime(3 * MIN);
    sdk.onForeground();
    sdk.setScreen('/home');
    sdk.flushAnalytics();
    await settle();

    expect(new Set(bodies().map((b) => b.sessionId))).toEqual(new Set([record]));
    expect(bodies().every((b) => !b.completed)).toBe(true);
    const names = events().map((e) => e.name);
    expect(names.filter((n) => n === 'deepdots_session_start')).toHaveLength(1);
    expect(events().find((e) => e.name === 'deepdots_session_suspend')).toMatchObject({ reason: 'background' });
    const resume = events().find((e) => e.name === 'deepdots_session_resume');
    expect(Number(resume?.suspended_ms)).toBeGreaterThanOrEqual(3 * MIN);
    expect(names).not.toContain('deepdots_session_end');
  });

  it('vuelve pasados 5 min: sesión nueva (foreground) en otro registro; la anterior no se toca', async () => {
    const sdk = await started();
    const record = bodies()[0].sessionId;

    sdk.onBackground();
    await settle();
    const sentWhileAway = bodies().length;
    vi.advanceTimersByTime(5 * MIN + 1);
    sdk.onForeground();
    sdk.flushAnalytics();
    await settle();

    const after = bodies().slice(sentWhileAway);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((b) => b.sessionId !== record)).toBe(true); // no reabre la vieja: la cierra el backend
    const start = after.flatMap(eventsOf).find((e) => e.name === 'deepdots_session_start');
    expect(start).toMatchObject({ reason: 'foreground' });
    expect(after.flatMap(eventsOf).some((e) => e.name === 'deepdots_session_resume')).toBe(false);
  });

  it('login fuera de la app: vuelve, reanuda la sesión anónima y el setUserId la cierra con user_change', async () => {
    const sdk = await started();
    const anon = sdk.getUserId();
    const record = bodies()[0].sessionId;

    sdk.onBackground();
    await settle();
    vi.advanceTimersByTime(40_000);
    sdk.onForeground();
    sdk.setUserId('user-a'); // la app identifica al usuario al volver del login
    sdk.flushAnalytics();
    await settle();

    const closing = bodies().find((b) => b.completed);
    expect(closing?.sessionId).toBe(record); // la sesión anónima, ya reanudada, se cierra aquí
    expect(eventsOf(closing!).find((e) => e.name === 'deepdots_session_end')).toMatchObject({ reason: 'user_change' });
    const start = events().find((e) => e.name === 'deepdots_session_start' && e.sessionId !== record);
    expect(start).toMatchObject({ reason: 'user_change', identified: true, previous_user_id: anon, previous_session_id: record });
  });

  it('sin el registro abierto todavía (primer POST en vuelo) se cierra como antes', async () => {
    fetchSpy.mockImplementation(() => new Promise(() => {})); // la API no responde
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      platform: 'android',
      storage: new InMemoryStorage(),
      analytics: { publicKey: 'pub-a', integration: 'int-bg' },
    });
    sdk.onBackground();
    await settle();
    const last = bodies().at(-1)!;
    expect(last.completed).toBe(true);
    expect(eventsOf(last).find((e) => e.name === 'deepdots_session_end')).toMatchObject({ reason: 'background' });
  });
});
