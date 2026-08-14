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
