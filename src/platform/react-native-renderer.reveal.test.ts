import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeepdotsPopups } from '../core/deepdots-popups';
import { ReactNativePopupRenderer, NATIVE_READY_GRACE_MS } from './react-native-renderer';
import { REVEAL_TIMEOUT_MS } from '../ui/reveal';

/**
 * Aviso de "listo para verse" hacia el host de React Native.
 *
 * El HTML del WebView ya se revela solo, pero el host que monta su propio Modal (el caso de
 * `renderChrome:false`) necesita saber cuándo abrirlo: si lo abre al recibir `onShow`, el usuario
 * ve un WebView en blanco mientras arranca el motor, se descarga el bundle del CDN y se pide el
 * survey. Con `onReady` puede montar el WebView fuera de pantalla y enseñarlo ya pintado.
 */
const def = { id: 'popup-rn', title: '', message: '', triggers: [], surveyId: 'survey-rn', productId: 'prod-rn' };

function showPopup(sdk: DeepdotsPopups) {
  (sdk as unknown as { showDefinition: (d: unknown) => void }).showDefinition(def);
}

describe('ReactNativePopupRenderer · aviso de listo', () => {
  let renderer: ReactNativePopupRenderer;
  let sdk: DeepdotsPopups;
  let ready: string[];

  beforeEach(() => {
    ready = [];
    renderer = new ReactNativePopupRenderer({
      onShow: () => {},
      onReady: (p) => ready.push(p.surveyId),
    });
    sdk = new DeepdotsPopups();
    sdk.setRenderer(renderer);
    sdk.init({ apiKey: 'fake-key' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa al host cuando el WebView dice que ya está pintado', () => {
    showPopup(sdk);
    expect(ready).toEqual([]);

    renderer.handleMessage(JSON.stringify({ name: 'ready' }));

    expect(ready).toEqual(['survey-rn']);
  });

  it('no repite el aviso si el WebView lo manda más de una vez', () => {
    showPopup(sdk);

    renderer.handleMessage(JSON.stringify({ name: 'ready' }));
    renderer.handleMessage(JSON.stringify({ name: 'ready' }));

    expect(ready).toEqual(['survey-rn']);
  });

  it('`ready` no cuenta como interacción del usuario', () => {
    // `popup_clicked` marca el popup como PARTIAL en el backend: que el survey termine de
    // pintarse no es que alguien lo haya tocado.
    const eventos: string[] = [];
    sdk.on('popup_clicked', () => eventos.push('clicked'));
    showPopup(sdk);

    renderer.handleMessage(JSON.stringify({ name: 'ready' }));

    expect(eventos).toEqual([]);
  });

  it('avisa igualmente si el WebView nunca responde', () => {
    // Si el WebView no llega ni a ejecutar el HTML (motor que no arranca, documento que no
    // carga), el techo de dentro del HTML no existe: el host se quedaría sin abrir el Modal.
    vi.useFakeTimers();
    showPopup(sdk);

    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS + NATIVE_READY_GRACE_MS);

    expect(ready).toEqual(['survey-rn']);
  });

  it('el techo nativo va por detrás del que lleva el HTML, para no adelantarse', () => {
    vi.useFakeTimers();
    showPopup(sdk);

    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS);
    expect(ready).toEqual([]);

    vi.advanceTimersByTime(NATIVE_READY_GRACE_MS);
    expect(ready).toEqual(['survey-rn']);
  });

  it('cerrar el popup cancela el aviso pendiente', () => {
    vi.useFakeTimers();
    showPopup(sdk);

    renderer.hide();
    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS + NATIVE_READY_GRACE_MS);

    expect(ready).toEqual([]);
  });

  it('el popup siguiente vuelve a avisar', () => {
    showPopup(sdk);
    renderer.handleMessage(JSON.stringify({ name: 'ready' }));
    renderer.hide();

    showPopup(sdk);
    renderer.handleMessage(JSON.stringify({ name: 'ready' }));

    expect(ready).toEqual(['survey-rn', 'survey-rn']);
  });

  it('funciona sin onReady (el host que no lo use no se entera)', () => {
    const solo = new ReactNativePopupRenderer({ onShow: () => {} });
    const otro = new DeepdotsPopups();
    otro.setRenderer(solo);
    otro.init({ apiKey: 'fake-key' });
    showPopup(otro);

    expect(() => solo.handleMessage(JSON.stringify({ name: 'ready' }))).not.toThrow();
  });
});
