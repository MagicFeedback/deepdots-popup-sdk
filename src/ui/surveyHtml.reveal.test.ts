import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSurveyHtml, REVEAL_JS } from './surveyHtml';
import { REVEAL_TIMEOUT_MS } from './reveal';

/**
 * Apertura diferida en la ruta del WebView (React Native).
 *
 * Aquí el chrome lo pinta el propio HTML, así que la revelación va dentro: el popup y el fondo
 * arrancan invisibles y se enseñan cuando el survey está pintado. En RN la espera es mayor que en
 * web (arranque del WebView + script del CDN + fetch del survey), así que el spinner se veía más
 * tiempo todavía.
 *
 * El HTML avisa además con un mensaje `ready`, para que el host que monte su propio Modal pueda
 * abrirlo en ese momento en vez de enseñar un WebView en blanco.
 */
const base = { surveyId: 's-1', productId: 'p-1' };

describe('buildSurveyHtml · apertura diferida (HTML)', () => {
  it('arranca con el popup y el fondo invisibles', () => {
    const html = buildSurveyHtml(base);

    expect(html).toContain('#dd-popup{visibility:hidden}');
    // El fondo (overlay) tampoco se pinta antes de tiempo: si no, en RN se vería el velo oscuro
    // varios cientos de ms antes que la tarjeta.
    expect(html).toMatch(/body\.dd-ready\{background:/);
  });

  it('revela marcando el body y avisa al host con `ready`', () => {
    const html = buildSurveyHtml(base);

    expect(html).toContain("document.body.classList.add('dd-ready')");
    expect(html).toContain("emitJSON('ready')");
  });

  it('hornea el mismo techo de tiempo que la ruta del DOM web', () => {
    const html = buildSurveyHtml(base);

    expect(html).toContain(`${REVEAL_TIMEOUT_MS})`);
    expect(html).toContain('ddCreateReveal(popup');
  });

  it('revela al terminar la carga, también cuando el survey falla', () => {
    const html = buildSurveyHtml(base);

    // `setLoading(false)` es el punto único por el que pasan tanto la carga correcta como los
    // caminos de error (script del CDN caído, generate() roto), igual que en el DOM web.
    expect(html).toMatch(/function setLoading\(isLoading\)\{[\s\S]*?ddReveal\.whenPainted\(\);/);
  });
});

/**
 * El algoritmo corre DENTRO del WebView, así que se embebe como texto. Se evalúa aquí para
 * probar el comportamiento de verdad y no solo que el string esté en el HTML: es el espejo ES5
 * de `revealWhenPainted` en `reveal.ts`, y las dos rutas deben comportarse igual.
 */
function loadReveal(): (popup: ParentNode, onReveal: () => void, timeoutMs: number) => { reveal: () => void; whenPainted: () => void } {
  const factory = new Function(`${REVEAL_JS}; return ddCreateReveal;`);
  return factory() as ReturnType<typeof loadReveal>;
}

function popupWith(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  el.querySelectorAll('img').forEach((img) => {
    Object.defineProperty(img, 'complete', {
      configurable: true,
      get(this: HTMLImageElement) { return this.dataset.ddLoaded === '1'; },
    });
  });
  return el;
}

function settle(img: HTMLImageElement, event: 'load' | 'error' = 'load') {
  img.dataset.ddLoaded = '1';
  img.dispatchEvent(new Event(event));
}

describe('ddCreateReveal · comportamiento dentro del WebView', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('revela en el acto si el popup no tiene imágenes', () => {
    const onReveal = vi.fn();
    const popup = popupWith('<p>sin imágenes</p>');

    loadReveal()(popup, onReveal, REVEAL_TIMEOUT_MS).whenPainted();

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('espera a las imágenes pendientes', () => {
    const onReveal = vi.fn();
    const popup = popupWith('<img id="logo"><img id="emoji">');
    loadReveal()(popup, onReveal, REVEAL_TIMEOUT_MS).whenPainted();

    expect(onReveal).not.toHaveBeenCalled();

    settle(popup.querySelector('#logo') as HTMLImageElement);
    expect(onReveal).not.toHaveBeenCalled();

    settle(popup.querySelector('#emoji') as HTMLImageElement);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('una imagen que falla no bloquea la apertura', () => {
    const onReveal = vi.fn();
    const popup = popupWith('<img id="roto">');
    loadReveal()(popup, onReveal, REVEAL_TIMEOUT_MS).whenPainted();

    settle(popup.querySelector('#roto') as HTMLImageElement, 'error');

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('el techo abre el popup aunque nada responda', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const popup = popupWith('<img id="colgada">');
    loadReveal()(popup, onReveal, REVEAL_TIMEOUT_MS).whenPainted();

    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS);

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('revela una sola vez: ni el techo ni una segunda carga repiten', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const popup = popupWith('<p>sin imágenes</p>');
    const ctrl = loadReveal()(popup, onReveal, REVEAL_TIMEOUT_MS);

    ctrl.whenPainted();
    ctrl.whenPainted();
    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS * 2);

    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
