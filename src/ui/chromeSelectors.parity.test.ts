import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup } from './renderPopup';
import { buildSurveyHtml } from './surveyHtml';

/**
 * Los selectores del chrome son superficie pública desde que existe `surveyCss`: el host escribe
 * CSS contra ellos y espera que la misma hoja valga en el popup web (DOM real) y en el survey de
 * React Native (WebView). Antes divergían — el título era `.deepdots-popup-title` en web y
 * `#dd-title` en RN, y los botones web no tenían selector propio — así que el mismo CSS no
 * aplicaba en las dos plataformas. Este test fija el set común.
 *
 * `.deepdots-success` queda fuera a propósito: se crea al completar el survey, no está en el
 * marcado inicial de ninguna de las dos rutas.
 */
const SELECTORES_PUBLICOS = [
  '#dd-popup',
  '.deepdots-popup',
  '.deepdots-popup-header',
  '#dd-title',
  '.deepdots-popup-title',
  '#dd-close',
  '#dd-progress',
  '.deepdots-progress',
  '.deepdots-progress-head',
  '#dd-progress-label',
  '#dd-progress-current',
  '#dd-progress-total',
  '#dd-progress-followup',
  '.deepdots-progress-track',
  '#dd-progress-bar',
  '#dd-content',
  '.deepdots-popup-container-content',
  '#dd-main',
  '.deepdots-popup-main',
  '#dd-form-wrapper',
  '#dd-error',
  '.deepdots-error-hint',
  '#dd-footer',
  '.deepdots-popup-footer',
  '#dd-submit',
  '#dd-back',
  '#dd-start',
  '#dd-complete',
];

describe('paridad de selectores del chrome (web ↔ WebView de RN)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('el WebView de React Native expone todos los selectores públicos', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    const ausentes = SELECTORES_PUBLICOS.filter((sel) => {
      const literal = sel.startsWith('#') ? `id="${sel.slice(1)}"` : sel.slice(1);
      return !html.includes(literal);
    });
    expect(ausentes).toEqual([]);
  });

  it('el popup web expone todos los selectores públicos', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderPopup(
      container, 's1', 'p1', undefined, () => {}, () => {},
      'production', undefined, undefined, undefined, undefined, undefined,
      { showProgressBar: true, title: 'App Survey' },
    );
    const ausentes = SELECTORES_PUBLICOS.filter((sel) => container.querySelector(sel) === null);
    expect(ausentes).toEqual([]);
  });

  /**
   * El icono de cerrar es el mismo trazo en las dos rutas y NO pinta fondo en ningún estado:
   * el diseño pedido es la X desnuda (antes era más gruesa, con puntas redondeadas, y el hover
   * pintaba una caja gris). Si una de las dos rutas se toca sin la otra, esto lo caza.
   */
  const CLOSE_PATH = 'M5 5L19 19M5 19L19 5';

  it('la X de cerrar es idéntica en las dos rutas: trazo fino, punta recta y sin fondo', async () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain(`<path d="${CLOSE_PATH}" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt"/>`);
    expect(html).toContain('#dd-close{background:transparent;');

    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderPopup(
      container, 's1', 'p1', undefined, () => {}, () => {},
      'production', undefined, undefined, undefined, undefined, undefined, {},
    );
    const closeBtn = container.querySelector('#dd-close') as HTMLButtonElement;
    const path = closeBtn.querySelector('path') as SVGPathElement;
    expect(path.getAttribute('d')).toBe(CLOSE_PATH);
    expect(path.getAttribute('stroke-width')).toBe('1.5');
    expect(path.getAttribute('stroke-linecap')).toBe('butt');
    expect(closeBtn.style.background).toBe('transparent');

    // El hover solo cambia color y escala; la caja gris de antes ya no vuelve.
    closeBtn.dispatchEvent(new Event('mouseenter'));
    expect(closeBtn.style.background).toBe('transparent');
  });

  it('los botones de navegación llevan la clase compartida en las dos rutas', async () => {
    // `.dd-nav-btn` permite estilar los cuatro de una vez sin enumerar ids.
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect((html.match(/class="dd-nav-btn"/g) ?? []).length).toBe(4);

    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderPopup(
      container, 's1', 'p1', undefined, () => {}, () => {},
      'production', undefined, undefined, undefined, undefined, undefined, {},
    );
    expect(container.querySelectorAll('.dd-nav-btn').length).toBe(4);
  });
});
