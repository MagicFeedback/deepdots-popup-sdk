import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_TASK_MAX_MS, backgroundTimerTask, runInBackgroundTask } from './background-task';
import { createFeedbackSink } from './feedback-payload';
import type { AnalyticsEnvelope } from './analytics-manager';

describe('runInBackgroundTask', () => {
  afterEach(() => vi.useRealTimers());

  it('abre la tarea antes del trabajo y la cierra una vez al terminar', async () => {
    const order: string[] = [];
    const end = vi.fn(() => order.push('end'));
    const result = await runInBackgroundTask(
      () => {
        order.push('begin');
        return end;
      },
      'x',
      async () => {
        order.push('work');
        return 42;
      },
    );
    expect(result).toBe(42);
    expect(order).toEqual(['begin', 'work', 'end']);
  });

  it('cierra la tarea aunque el trabajo falle', async () => {
    const end = vi.fn();
    await expect(runInBackgroundTask(() => end, 'x', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('cierra la tarea al llegar al techo si el trabajo no termina, y no la cierra dos veces', async () => {
    vi.useFakeTimers();
    const end = vi.fn();
    let finish!: () => void;
    const p = runInBackgroundTask(() => end, 'x', () => new Promise<void>((r) => { finish = r; }));
    await vi.advanceTimersByTimeAsync(BACKGROUND_TASK_MAX_MS - 1);
    expect(end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(end).toHaveBeenCalledTimes(1);
    finish();
    await p;
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('si begin falla o no devuelve función, el trabajo se ejecuta igual', async () => {
    await expect(runInBackgroundTask(() => { throw new Error('no native module'); }, 'x', async () => 'ok')).resolves.toBe('ok');
    await expect(runInBackgroundTask((() => undefined) as never, 'x', async () => 'ok')).resolves.toBe('ok');
    await expect(runInBackgroundTask(undefined, 'x', async () => 'ok')).resolves.toBe('ok');
  });

  it('el trabajo arranca en la misma tarea (el POST de un pagehide no puede esperar a otro tick)', () => {
    const work = vi.fn(async () => {});
    void runInBackgroundTask(() => () => {}, 'x', work);
    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe('backgroundTimerTask (react-native-background-timer)', () => {
  it('start con la primera tarea y stop al cerrar la última; un end repetido no cuenta', () => {
    const timer = { start: vi.fn(), stop: vi.fn() };
    const begin = backgroundTimerTask(timer);
    const endA = begin('a');
    const endB = begin('b');
    expect(timer.start).toHaveBeenCalledTimes(1);
    endA();
    endA();
    expect(timer.stop).not.toHaveBeenCalled();
    endB();
    expect(timer.stop).toHaveBeenCalledTimes(1);
    begin('c');
    expect(timer.start).toHaveBeenCalledTimes(2);
  });
});

describe('createFeedbackSink + backgroundTask', () => {
  const envelope = (): AnalyticsEnvelope => ({
    userId: 'u1',
    sessionId: null,
    context: { platform: 'ios', attributes: {} },
    events: [{ name: 'deepdots_session_end', timestamp: 1, params: { reason: 'background' } }],
  });

  it('mantiene la tarea abierta hasta que el POST de cierre responde', async () => {
    let respond!: (v: unknown) => void;
    const fetchImpl = vi.fn(() => new Promise((r) => { respond = r; }));
    const end = vi.fn();
    const begin = vi.fn(() => end);
    const sink = createFeedbackSink({
      baseUrl: 'https://api-dev.deepdots.com',
      keys: { publicKey: 'p', integration: 'i' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backgroundTask: begin,
    });
    const done = sink(envelope(), { sessionEnd: true }) as Promise<void>;
    expect(begin).toHaveBeenCalledWith('deepdots-analytics');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // el POST ya salió, en la misma tarea
    expect(end).not.toHaveBeenCalled();
    respond({ ok: true, text: async () => '' });
    await done;
    expect(end).toHaveBeenCalledTimes(1);
  });
});
