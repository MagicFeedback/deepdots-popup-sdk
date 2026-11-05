import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import {
  createHermesRejectionHub,
  registerReactNativePlatform,
  resetReactNativePlatform,
  type RejectionTrackingOptions,
} from '../platform/react-native-platform';
import type { DeepdotsInitParams, PopupDefinition } from '../types';

/**
 * Contrato de detección automática, paso 2 (React Native): pantallas, segmentación por ruta,
 * triggers de exit/scroll/click y promesas rechazadas sin `catch`, sin código extra del host.
 * Por señal: activa por defecto, `autoTrack.<señal> = false` la apaga, la llamada manual manda
 * sin duplicar, y sin la pieza que hace falta el SDK sigue como antes.
 */

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function def(overrides: Partial<PopupDefinition>): PopupDefinition {
  return {
    id: 'popup-1',
    title: 't',
    message: 'm',
    triggers: [{ type: 'event', value: 'never' }],
    surveyId: 'survey-1',
    productId: 'product-1',
    ...overrides,
  };
}

/** Un `NavigationContainerRef` de React Navigation, lo justo. */
function fakeNavigationRef(initial?: { name: string; params?: Record<string, unknown> }) {
  let current = initial;
  const listeners: Record<string, Array<() => void>> = {};
  return {
    isReady: () => current !== undefined,
    getCurrentRoute: () => current,
    addListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
      return () => { listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb); };
    }),
    navigate(name: string, params?: Record<string, unknown>) {
      current = { name, params };
      (listeners.state ?? []).forEach((l) => l());
    },
    ready(route: { name: string }) {
      current = route;
      (listeners.ready ?? []).forEach((l) => l());
    },
  };
}

async function initRn(defs: PopupDefinition[], extra: Partial<DeepdotsInitParams> = {}) {
  mockPopupsApi(defs);
  const sdk = new DeepdotsPopups();
  sdk.setRenderer(new NoopPopupRenderer());
  sdk.init({ apiKey: 'k', storage: new InMemoryStorage(), ...extra });
  await flushPopupsLoad();
  const shown = vi.fn();
  sdk.on('popup_shown', shown);
  return { sdk, shown };
}

const pageViews = (sdk: DeepdotsPopups) =>
  sdk.previewAnalytics().events.filter((e) => e.name === 'deepdots_page_view').map((e) => e.params?.screen);

describe('React Native: detección automática (paso 2)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    registerReactNativePlatform({ os: 'ios' });
  });
  afterEach(() => {
    resetReactNativePlatform();
    vi.unstubAllGlobals();
  });

  describe('pantallas (React Navigation)', () => {
    it('por defecto: el ref de navegación emite page_view sin que el host llame a setScreen', async () => {
      const { sdk } = await initRn([]);
      const nav = fakeNavigationRef({ name: 'Home' });
      sdk.trackNavigation(nav);
      nav.navigate('Cart');
      nav.navigate('Checkout');
      expect(pageViews(sdk)).toEqual(['/Home', '/Cart']);
    });

    it('funciona aunque el ref se enganche antes del init (efectos del hijo antes que los del Provider)', async () => {
      mockPopupsApi([]);
      const sdk = new DeepdotsPopups();
      sdk.setRenderer(new NoopPopupRenderer());
      const nav = fakeNavigationRef();
      sdk.trackNavigation(nav);
      nav.ready({ name: 'Home' });
      sdk.init({ apiKey: 'k', storage: new InMemoryStorage() });
      nav.navigate('Cart');
      expect(pageViews(sdk)).toEqual(['/Home']);
    });

    it('screenName renombra la ruta; null mantiene el nombre detectado', async () => {
      const { sdk } = await initRn([], {
        screenName: (route) => (route.name === 'Product' ? `/product/${String(route.params?.id)}` : null),
      });
      const nav = fakeNavigationRef({ name: 'Product', params: { id: 7 } });
      sdk.trackNavigation(nav);
      nav.navigate('Home');
      nav.navigate('Cart');
      // page_view agrupa ids (`:id`), como cualquier pantalla.
      expect(pageViews(sdk)).toEqual(['/product/:id', '/Home']);
    });

    it('autoTrack.screens = false: el ref no emite nada; setScreen sigue funcionando', async () => {
      const { sdk } = await initRn([], { autoTrack: { screens: false } });
      const nav = fakeNavigationRef({ name: 'Home' });
      sdk.trackNavigation(nav);
      nav.navigate('Cart');
      expect(pageViews(sdk)).toEqual([]);
      sdk.setScreen('A');
      sdk.setScreen('B');
      expect(pageViews(sdk)).toEqual(['/A']);
    });

    it('setScreen manual manda: el ref deja de emitir y no hay visitas duplicadas', async () => {
      const { sdk } = await initRn([]);
      const nav = fakeNavigationRef({ name: 'Home' });
      sdk.trackNavigation(nav);
      sdk.setScreen('Home'); // el host además lo llama (integración anterior)
      nav.navigate('Cart'); // ignorado: manda lo manual
      sdk.setScreen('Cart');
      sdk.setScreen('Checkout');
      expect(pageViews(sdk)).toEqual(['/Home', '/Cart']);
    });

    it('sin React Navigation (ref sin API) no rompe y todo sigue como antes', async () => {
      const { sdk } = await initRn([]);
      expect(() => sdk.trackNavigation({} as never)).not.toThrow();
      expect(() => sdk.trackNavigation(null as never)).not.toThrow();
      sdk.setScreen('A');
      sdk.setScreen('B');
      expect(pageViews(sdk)).toEqual(['/A']);
    });
  });

  describe('segments.path / excludedPaths con la pantalla actual', () => {
    const segmented = def({
      triggers: [{ type: 'event', value: 'buy' }],
      segments: { path: ['/Cart'], excludedPaths: ['/Cart/Promo'] },
    });

    it('la pantalla de setScreen decide segments.path', async () => {
      const { sdk, shown } = await initRn([segmented]);
      sdk.setScreen('Home');
      sdk.triggerEvent('buy');
      expect(shown).not.toHaveBeenCalled();
      sdk.setScreen('Cart');
      sdk.triggerEvent('buy');
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('excludedPaths gana con la pantalla actual', async () => {
      const { sdk, shown } = await initRn([segmented]);
      sdk.setScreen('Cart/Promo');
      sdk.triggerEvent('buy');
      expect(shown).not.toHaveBeenCalled();
    });

    it('la pantalla detectada por el ref (y renombrada) también segmenta', async () => {
      const { sdk, shown } = await initRn([segmented], {
        screenName: (r) => (r.name === 'Basket' ? '/Cart' : null),
      });
      const nav = fakeNavigationRef({ name: 'Basket' });
      sdk.trackNavigation(nav);
      sdk.triggerEvent('buy');
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('sin pantalla conocida no bloquea (comportamiento anterior en RN)', async () => {
      const { sdk, shown } = await initRn([segmented]);
      sdk.triggerEvent('buy');
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('trigger exit', () => {
    const exitDef = def({ triggers: [{ type: 'exit', value: 0 }], segments: { path: ['/Checkout'] } });

    it('por defecto: salir de la pantalla configurada muestra el popup en la siguiente', async () => {
      const { sdk, shown } = await initRn([exitDef]);
      const nav = fakeNavigationRef({ name: 'Checkout' });
      sdk.trackNavigation(nav);
      nav.navigate('Home');
      await wait(5);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('respeta el retardo y no se muestra si se vuelve a la pantalla de origen', async () => {
      const { sdk, shown } = await initRn([def({ triggers: [{ type: 'exit', value: 0.03 }], segments: { path: ['/Checkout'] } })]);
      sdk.setScreen('Checkout');
      sdk.setScreen('Home');
      sdk.setScreen('Checkout');
      await wait(50);
      expect(shown).not.toHaveBeenCalled();
    });

    it('excludedPaths de la pantalla de destino lo bloquea', async () => {
      const { sdk, shown } = await initRn([def({ triggers: [{ type: 'exit', value: 0 }], segments: { excludedPaths: ['/Payment'] } })]);
      sdk.setScreen('Checkout');
      sdk.setScreen('Payment');
      await wait(5);
      expect(shown).not.toHaveBeenCalled();
    });

    it('autoLaunch en RN no instala listeners de History (no hay) ni duplica el exit', async () => {
      const { sdk, shown } = await initRn([exitDef]);
      expect(() => sdk.autoLaunch()).not.toThrow();
      sdk.setScreen('Checkout');
      sdk.setScreen('Home');
      await wait(5);
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('trigger scroll', () => {
    const scrollDef = def({ triggers: [{ type: 'scroll', value: 50 }] });

    it('por defecto: el componente de scroll dispara al pasar el umbral, una vez por pantalla', async () => {
      const { sdk, shown } = await initRn([scrollDef]);
      sdk.setScreen('Article');
      sdk.reportAutoScroll(20);
      expect(shown).not.toHaveBeenCalled();
      sdk.reportAutoScroll(60);
      sdk.reportAutoScroll(80);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('autoTrack.scroll = false: el componente no dispara; onScroll manual sí', async () => {
      const { sdk, shown } = await initRn([scrollDef], { autoTrack: { scroll: false } });
      sdk.reportAutoScroll(90);
      expect(shown).not.toHaveBeenCalled();
      sdk.onScroll(90);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('onScroll manual manda: el componente se ignora y no hay duplicados', async () => {
      const { sdk, shown } = await initRn([scrollDef]);
      sdk.onScroll(10);
      sdk.reportAutoScroll(90); // ignorado: manda lo manual
      expect(shown).not.toHaveBeenCalled();
      sdk.onScroll(55);
      sdk.onScroll(70);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('un scroll antes de que lleguen los popups se guarda y se evalúa al cargar', async () => {
      mockPopupsApi([scrollDef]);
      const sdk = new DeepdotsPopups();
      sdk.setRenderer(new NoopPopupRenderer());
      sdk.init({ apiKey: 'k', storage: new InMemoryStorage() });
      const shown = vi.fn();
      sdk.on('popup_shown', shown);
      sdk.onScroll(75);
      await flushPopupsLoad();
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('sin componente de scroll no pasa nada, y autoLaunch no rompe sin window.addEventListener', async () => {
      const { sdk, shown } = await initRn([scrollDef]);
      const original = window.addEventListener;
      // En React Native `window` es el global y no tiene addEventListener.
      (window as unknown as { addEventListener?: unknown }).addEventListener = undefined;
      try {
        expect(() => sdk.autoLaunch()).not.toThrow();
      } finally {
        window.addEventListener = original;
      }
      expect(shown).not.toHaveBeenCalled();
    });
  });

  describe('trigger click', () => {
    const clickDef = def({ triggers: [{ type: 'click', value: 'buy-button' }] });

    it('triggerClick(id) dispara el popup con ese id', async () => {
      const { sdk, shown } = await initRn([clickDef]);
      sdk.triggerClick('other');
      expect(shown).not.toHaveBeenCalled();
      sdk.triggerClick(' buy-button ');
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('sin document (RN) autoLaunch no rompe y triggerClick sigue funcionando', async () => {
      const { sdk, shown } = await initRn([clickDef]);
      vi.stubGlobal('document', undefined);
      expect(() => sdk.autoLaunch()).not.toThrow();
      vi.unstubAllGlobals();
      sdk.triggerClick('buy-button');
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('promesas rechazadas sin catch (Hermes)', () => {
    function fakeHermes() {
      let options: RejectionTrackingOptions | undefined;
      let seq = 0;
      return {
        enablePromiseRejectionTracker: vi.fn((o?: RejectionTrackingOptions) => { options = o; }),
        reject(error: unknown) { options?.onUnhandled?.(seq++, error); },
      };
    }
    const queued = (storage: InMemoryStorage) => JSON.parse(storage.getItem('deepdots.crash.queue') ?? '[]');

    it('por defecto: una promesa rechazada sin catch queda registrada como crash', async () => {
      const hermes = fakeHermes();
      registerReactNativePlatform({ os: 'ios', promiseRejections: createHermesRejectionHub(hermes, { dev: false }) });
      const storage = new InMemoryStorage();
      await initRn([], { storage });
      hermes.reject(new TypeError('no catch'));
      const q = queued(storage);
      expect(q).toHaveLength(1);
      expect(q[0]).toMatchObject({ crashType: 'TypeError', message: 'no catch', handled: false });
    });

    it('autoTrack.errors = false: no engancha el tracker', async () => {
      const hermes = fakeHermes();
      const enable = hermes.enablePromiseRejectionTracker;
      registerReactNativePlatform({ os: 'ios', promiseRejections: createHermesRejectionHub(hermes, { dev: false }) });
      const storage = new InMemoryStorage();
      await initRn([], { storage, autoTrack: { errors: false } });
      expect(enable).not.toHaveBeenCalled();
      hermes.reject(new Error('x'));
      expect(queued(storage)).toHaveLength(0);
    });

    it('un tracker que instala el host después (p. ej. Sentry) sigue recibiéndolo y no se duplica', async () => {
      const hermes = fakeHermes();
      const hub = createHermesRejectionHub(hermes, { dev: false });
      registerReactNativePlatform({ os: 'ios', promiseRejections: hub });
      const storage = new InMemoryStorage();
      const { sdk } = await initRn([], { storage });
      const sentry = vi.fn();
      hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: sentry });
      sdk.setTrackingEnabled(false);
      sdk.setTrackingEnabled(true); // re-engancha handlers: no debe duplicar
      hermes.reject(new Error('boom'));
      expect(sentry).toHaveBeenCalledTimes(1);
      expect(queued(storage)).toHaveLength(1);
    });

    it('sin Hermes (o sin el tracker) no rompe nada', async () => {
      expect(createHermesRejectionHub(undefined, { dev: false })).toBeNull();
      expect(createHermesRejectionHub({}, { dev: false })).toBeNull();
      registerReactNativePlatform({ os: 'android', promiseRejections: null });
      await expect(initRn([])).resolves.toBeDefined();
    });
  });
});

describe('trigger click en web: listener del DOM y triggerClick', () => {
  const clickDef = def({ triggers: [{ type: 'click', value: 'buy-button' }] });

  beforeEach(() => {
    document.body.innerHTML = '<button id="buy-button">Buy</button>';
  });
  afterEach(() => vi.unstubAllGlobals());

  async function initWeb(extra: Partial<DeepdotsInitParams> = {}) {
    const r = await initRn([clickDef], extra);
    r.sdk.autoLaunch();
    return r;
  }
  const click = () => document.getElementById('buy-button')!.click();

  it('por defecto: el click en el elemento dispara el popup', async () => {
    const { shown } = await initWeb();
    click();
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('autoTrack.clicks = false: el click del DOM no dispara; triggerClick sí', async () => {
    const { sdk, shown } = await initWeb({ autoTrack: { clicks: false } });
    click();
    expect(shown).not.toHaveBeenCalled();
    sdk.triggerClick('buy-button');
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('triggerClick manual manda: el listener del DOM se ignora y no hay duplicados', async () => {
    const { sdk, shown } = await initWeb();
    sdk.triggerClick('buy-button');
    click();
    expect(shown).toHaveBeenCalledTimes(1);
  });
});
