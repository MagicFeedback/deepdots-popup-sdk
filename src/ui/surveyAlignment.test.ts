import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Alineación del contenido del survey con el chrome del popup.
 *
 * El margen lateral lo pone la tarjeta del popup, pero el CSS de `@magicfeedback/native` añade el
 * suyo en tres capas: `.magicfeedback-container`, `.magicfeedback-form` (14px en el breakpoint
 * móvil, hasta 28px en escritorio) y `.magicfeedback-div`, el bloque de cada pregunta. El
 * resultado es que el enunciado y las opciones quedan varias decenas de px más adentro que el
 * logo, el título y la barra de progreso, que sí llegan al borde de la tarjeta.
 *
 * Se anula solo el padding lateral: el vertical es el que separa las preguntas entre sí y del
 * borde. Mismas reglas en las dos rutas, para que el popup se vea igual en navegador y en el
 * WebView de React Native.
 */

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 1,
    generate: () => Promise.resolve(),
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup, SURVEY_ALIGNMENT_STYLE_ID } = await import('./renderPopup');
const { buildSurveyHtml } = await import('./surveyHtml');

const SELECTORS = ['magicfeedback-container', 'magicfeedback-form', 'magicfeedback-div'];

async function render(container: HTMLElement) {
  await renderPopup(container, 's-1', 'p-1', undefined, () => {}, () => {}, 'production');
  await Promise.resolve();
}

describe('alineación del survey · popup DOM (web)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('anula el padding lateral que mete el CSS del survey', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await render(container);

    const style = document.getElementById(SURVEY_ALIGNMENT_STYLE_ID);
    expect(style).not.toBeNull();
    for (const selector of SELECTORS) {
      expect(style!.textContent).toContain(`.deepdots-popup .${selector}`);
    }
    expect(style!.textContent).toContain('padding-left: 0');
    expect(style!.textContent).toContain('padding-right: 0');
  });

  it('acota las reglas al popup, para no repintar la web del host', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await render(container);

    const css = document.getElementById(SURVEY_ALIGNMENT_STYLE_ID)!.textContent ?? '';
    // Este CSS se inyecta en el <head> del host: una regla desnuda tocaría sus propios
    // formularios si usara las mismas clases.
    const selectors = css.split('{')[0].split(',').map((s) => s.trim());
    expect(selectors.every((s) => s.startsWith('.deepdots-popup '))).toBe(true);
  });

  it('gana sobre el CSS del paquete y pierde contra el del host', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await render(container, );

    const ids = Array.from(document.head.querySelectorAll('style')).map((s) => s.id);
    expect(ids.indexOf(SURVEY_ALIGNMENT_STYLE_ID)).toBeGreaterThan(ids.indexOf('magicfeedback-sdk-styles'));
  });

  it('no duplica el bloque al abrir el popup otra vez', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await render(container);
    await render(container);

    expect(document.querySelectorAll(`#${SURVEY_ALIGNMENT_STYLE_ID}`).length).toBe(1);
  });
});

describe('alineación del survey · WebView (React Native)', () => {
  it('lleva las mismas reglas que la ruta del navegador', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

    for (const selector of SELECTORS) {
      expect(html).toContain(`.deepdots-popup .${selector}`);
    }
    expect(html).toMatch(/padding-left:\s*0/);
    expect(html).toMatch(/padding-right:\s*0/);
  });

  it('conserva el padding vertical del formulario', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

    // Anular el padding entero juntaría las preguntas con el borde de la tarjeta.
    expect(html).not.toMatch(/\.deepdots-popup \.magicfeedback-form\{padding:\s*0/);
  });
});
