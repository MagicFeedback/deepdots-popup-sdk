import { describe, it, expect, beforeEach } from 'vitest';
import { setSurveyBusy, BUSY_JS } from './busy';

/**
 * Bloqueo del survey mientras carga.
 *
 * El spinner de las transiciones entre páginas no tapaba nada: es un círculo de 28px en
 * posición absoluta, y `setLoading(true)` solo ocultaba el footer y deshabilitaba SUS botones.
 * El contenido del survey seguía respondiendo, así que el usuario podía cambiar de opción
 * mientras se enviaba la página — y ese cambio ya no viajaba con ella, porque la respuesta se
 * había mandado: creía haber corregido su respuesta y no era así.
 */
describe('setSurveyBusy', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('bloquea la interacción mientras carga', () => {
    setSurveyBusy(el, true);

    expect(el.style.pointerEvents).toBe('none');
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('la devuelve al soltar', () => {
    setSurveyBusy(el, true);
    setSurveyBusy(el, false);

    // Cadena vacía, no 'auto': así el CSS del host sigue mandando sobre este elemento.
    expect(el.style.pointerEvents).toBe('');
    expect(el.getAttribute('aria-busy')).toBe('false');
  });

  it('marca `inert` donde el motor lo soporte, para sacarlo del tab y del lector', () => {
    if (!('inert' in el)) return; // WebViews antiguos: basta con pointer-events
    setSurveyBusy(el, true);
    expect((el as HTMLElement & { inert?: boolean }).inert).toBe(true);

    setSurveyBusy(el, false);
    expect((el as HTMLElement & { inert?: boolean }).inert).toBe(false);
  });

  it('no se cae sin elemento', () => {
    expect(() => setSurveyBusy(null, true)).not.toThrow();
  });
});

describe('BUSY_JS · espejo para el WebView', () => {
  it('deja el elemento igual que la versión del módulo', () => {
    // Corre dentro del WebView (React Native y KMP), así que va como texto; este test evita
    // que las dos implementaciones se separen.
    const factory = new Function(`${BUSY_JS}; return ddSetSurveyBusy;`);
    const apply = factory() as (el: HTMLElement, busy: boolean) => void;

    const webView = document.createElement('div');
    const dom = document.createElement('div');

    apply(webView, true);
    setSurveyBusy(dom, true);
    expect(webView.getAttribute('style')).toBe(dom.getAttribute('style'));
    expect(webView.getAttribute('aria-busy')).toBe(dom.getAttribute('aria-busy'));

    apply(webView, false);
    setSurveyBusy(dom, false);
    expect(webView.getAttribute('style')).toBe(dom.getAttribute('style'));
    expect(webView.getAttribute('aria-busy')).toBe(dom.getAttribute('aria-busy'));
  });
});
