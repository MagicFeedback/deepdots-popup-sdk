import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { setupReactNative } from '../react-native/setup';
import {
  nativeModuleTask,
  registerReactNativePlatform,
  resetReactNativePlatform,
  resolveBackgroundTask,
} from '../platform/react-native-platform';

/**
 * Contrato de detección automática, paso 1 (DD-55): en React Native el SDK escucha AppState y
 * usa el módulo nativo de background (iOS) sin que el host escriba código. Lo manual sigue
 * funcionando y no duplica nada.
 */
type Body = { sessionId?: string; completed?: boolean; integration: string; feedback: { metadata: { key: string; value: string[] }[] } };
const names = (b: Body) => b.feedback.metadata.filter((m) => m.value[0]?.startsWith('{')).map((m) => m.key);
const settle = () => new Promise((r) => setTimeout(r, 0));

function fakeAppState() {
  const listeners: ((s: string) => void)[] = [];
  return {
    listeners,
    addEventListener: vi.fn((_t: 'change', l: (s: string) => void) => {
      listeners.push(l);
      return { remove: () => listeners.splice(listeners.indexOf(l), 1) };
    }),
    emit: (s: string) => listeners.slice().forEach((l) => l(s)),
  };
}

function fakeNativeModule() {
  const open = new Set<string>();
  return {
    open,
    begin: vi.fn((token: string) => void open.add(token)),
    end: vi.fn((token: string) => void open.delete(token)),
  };
}

describe('React Native: ciclo de vida y background automáticos', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      return { ok: true, json: async () => ({ sessionId: body.sessionId }), text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    resetReactNativePlatform();
    vi.unstubAllGlobals();
  });

  const bodies = (integration: string): Body[] =>
    fetchSpy.mock.calls
      .filter(([u]) => String(u).endsWith('/sdk/feedback'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body)
      .filter((b) => b.integration === integration);

  const init = (integration: string, extra: Partial<Parameters<DeepdotsPopups['init']>[0]> = {}) => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      storage: new InMemoryStorage(),
      analytics: { publicKey: 'pub-a', integration },
      ...extra,
    });
    return sdk;
  };

  it('sin código del host: background cierra la sesión dentro de la background task nativa (iOS)', async () => {
    const appState = fakeAppState();
    const native = fakeNativeModule();
    registerReactNativePlatform({ os: 'ios', appState, backgroundTaskModule: native });

    const sdk = init('int-auto-bg');
    sdk.setScreen('/home');
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);

    appState.emit('inactive');
    appState.emit('background');
    await settle();
    await settle();

    const closing = bodies('int-auto-bg').find((b) => b.completed);
    expect(closing).toBeDefined();
    expect(names(closing!)).toContain('deepdots_session_end');
    expect(native.begin).toHaveBeenCalled();
    expect(native.end).toHaveBeenCalledTimes(native.begin.mock.calls.length);
    expect(native.open.size).toBe(0);

    // 'active' abre una sesión nueva.
    appState.emit('active');
    sdk.flushAnalytics();
    await settle();
    const last = bodies('int-auto-bg').at(-1)!;
    expect(names(last)).toContain('deepdots_session_start');
    expect(last.sessionId).not.toBe(closing!.sessionId);
  });

  it('el host que además llama a onBackground (integración anterior) no duplica el cierre', async () => {
    const appState = fakeAppState();
    registerReactNativePlatform({ os: 'ios', appState });
    const sdk = init('int-auto-manual');
    sdk.setScreen('/home');

    sdk.onBackground(); // su propio listener
    appState.emit('background'); // el del SDK
    await settle();

    const ends = bodies('int-auto-manual').flatMap(names).filter((n) => n === 'deepdots_session_end');
    expect(ends).toHaveLength(1);
  });

  it('autoTrack.lifecycle: false no escucha AppState', () => {
    const appState = fakeAppState();
    registerReactNativePlatform({ os: 'ios', appState });
    init('int-auto-off', { autoTrack: { lifecycle: false } });
    expect(appState.addEventListener).not.toHaveBeenCalled();
  });

  it('sin platform en el init, usa Platform.OS', async () => {
    registerReactNativePlatform({ os: 'android', appState: fakeAppState() });
    const sdk = init('int-auto-platform');
    sdk.flushAnalytics();
    await settle();
    const platform = bodies('int-auto-platform')[0].feedback.metadata.find((m) => m.key === 'deepdots_platform');
    expect(platform?.value[0]).toBe('android');
  });

  it('en web (sin plataforma RN registrada) no cambia nada', () => {
    const sdk = init('int-auto-web');
    expect(sdk.previewAnalytics().context.platform).toBe('web');
  });

  it('setupReactNative con appState deja un solo listener', () => {
    const appState = fakeAppState();
    registerReactNativePlatform({ os: 'ios', appState });
    const sdk = new DeepdotsPopups();
    setupReactNative(
      sdk,
      { apiKey: 'pk-1', nodeEnv: 'development' },
      { platform: 'ios', renderer: new NoopPopupRenderer(), appState },
    );
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('resolveBackgroundTask / nativeModuleTask', () => {
  it('la del host gana sobre el módulo nativo', () => {
    const explicit = vi.fn(() => () => {});
    expect(resolveBackgroundTask(explicit, { os: 'ios', backgroundTaskModule: fakeNativeModule() })).toBe(explicit);
  });

  it('usa el módulo nativo solo en iOS y si tiene begin/end', () => {
    const mod = fakeNativeModule();
    expect(resolveBackgroundTask(undefined, { os: 'ios', backgroundTaskModule: mod })).toBeTypeOf('function');
    expect(resolveBackgroundTask(undefined, { os: 'android', backgroundTaskModule: mod })).toBeUndefined();
    expect(resolveBackgroundTask(undefined, { os: 'ios', backgroundTaskModule: {} as never })).toBeUndefined();
    expect(resolveBackgroundTask(undefined, { os: 'ios' })).toBeUndefined();
    expect(resolveBackgroundTask(undefined, null)).toBeUndefined();
  });

  it('cada tarea tiene su token y un end repetido no vuelve a llamar al nativo', () => {
    const mod = fakeNativeModule();
    const begin = nativeModuleTask(mod);
    const endA = begin('a');
    const endB = begin('b');
    const [tokenA] = mod.begin.mock.calls[0];
    const [tokenB] = mod.begin.mock.calls[1];
    expect(tokenA).not.toBe(tokenB);
    endA();
    endA();
    expect(mod.end).toHaveBeenCalledTimes(1);
    expect(mod.end).toHaveBeenCalledWith(tokenA);
    endB();
    expect(mod.open.size).toBe(0);
  });
});
