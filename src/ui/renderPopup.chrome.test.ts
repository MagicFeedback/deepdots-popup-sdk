import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup } from './renderPopup';
import type { PopupRenderOptions } from '../platform/renderer';

/**
 * Cabecera (título + X), barra de progreso y layout del popup DOM. El survey en sí lo monta
 * `@magicfeedback/native` contra la red, así que aquí solo se comprueba el chrome que pinta
 * el SDK antes de que el form cargue: es justo lo que el host ve y lo que arrastraba los bugs
 * del Back y del footer atrapado dentro del scroll.
 */
function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

async function render(container: HTMLElement, options?: PopupRenderOptions) {
  await renderPopup(
    container,
    'test-survey',
    'test-product',
    undefined,
    () => {},
    () => { container.innerHTML = ''; },
    'production',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options,
  );
}

describe('renderPopup cabecera', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('sin título: la cabecera solo muestra la X', async () => {
    const container = makeContainer();
    await render(container);
    const title = container.querySelector('.deepdots-popup-title') as HTMLElement;
    expect(title).toBeTruthy();
    expect(title.hidden).toBe(true);
    expect(title.textContent).toBe('');
  });

  it('con título: lo pinta a la izquierda de la X', async () => {
    const container = makeContainer();
    await render(container, { title: 'App Survey' });
    const title = container.querySelector('.deepdots-popup-title') as HTMLElement;
    expect(title.hidden).toBe(false);
    expect(title.textContent).toBe('App Survey');

    const header = container.querySelector('.deepdots-popup-header') as HTMLElement;
    expect(header.firstElementChild).toBe(title);
    expect(header.lastElementChild?.tagName).toBe('BUTTON');
  });

  it('el título entra como texto, no como HTML', async () => {
    const container = makeContainer();
    await render(container, { title: '<img src=x onerror=alert(1)>' });
    const title = container.querySelector('.deepdots-popup-title') as HTMLElement;
    expect(title.querySelector('img')).toBeNull();
    expect(title.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('renderPopup barra de progreso', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('existe siempre en el DOM pero arranca oculta (hace falta total > 1)', async () => {
    const container = makeContainer();
    await render(container, { showProgressBar: true });
    const progress = container.querySelector('.deepdots-progress') as HTMLElement;
    expect(progress).toBeTruthy();
    expect(progress.style.display).toBe('none');
  });

  it('va entre la cabecera y el contenido, fuera del área scrollable', async () => {
    const container = makeContainer();
    await render(container, { showProgressBar: true });
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    const children = Array.from(popup.children).map((c) => c.className);
    expect(children[0]).toContain('deepdots-popup-header');
    expect(children[1]).toContain('deepdots-progress');
  });
});

describe('renderPopup métricas del diseño', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('el contenido no añade sangrado sobre el de la tarjeta', async () => {
    const container = makeContainer();
    await render(container);
    const cc = container.querySelector('.deepdots-popup-container-content') as HTMLElement;
    // Antes era '0 20px 12px 20px' y dejaba las preguntas más adentro que el título.
    expect(cc.style.paddingLeft).toBe('0px');
    expect(cc.style.paddingRight).toBe('0px');
  });

  it('la etiqueta de progreso separa el número del "of N"', async () => {
    const container = makeContainer();
    await render(container, { showProgressBar: true });
    const label = container.querySelector('.deepdots-progress span') as HTMLElement;
    expect(label.children.length).toBe(2);
    expect((label.children[0] as HTMLElement).style.fontWeight).toBe('700');
    expect((label.children[1] as HTMLElement).style.fontWeight).toBe('400');
  });
});

describe('renderPopup surveyCss (CSS del host)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('deepdots-custom-css')?.remove();
  });

  it('sin surveyCss no deja hoja de estilos del host', async () => {
    await render(makeContainer());
    expect(document.getElementById('deepdots-custom-css')).toBeNull();
  });

  it('inyecta el CSS del host como última hoja del head', async () => {
    const css = '.magicfeedback-radio-container{border:none}';
    await render(makeContainer(), { surveyCss: css });
    const el = document.getElementById('deepdots-custom-css') as HTMLStyleElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toBe(css);
    // Debe ir tras la hoja de @magicfeedback/native para ganar en cascada.
    const sheets = Array.from(document.head.querySelectorAll('style')).map((s) => s.id);
    expect(sheets.indexOf('deepdots-custom-css')).toBe(sheets.length - 1);
    expect(sheets.indexOf('deepdots-custom-css')).toBeGreaterThan(sheets.indexOf('magicfeedback-sdk-styles'));
  });

  it('un render posterior sin surveyCss retira la hoja', async () => {
    await render(makeContainer(), { surveyCss: '.x{color:red}' });
    expect(document.getElementById('deepdots-custom-css')).toBeTruthy();
    await render(makeContainer());
    expect(document.getElementById('deepdots-custom-css')).toBeNull();
  });
});

describe('renderPopup layout', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('el footer es hermano del área scrollable, no hijo suyo', async () => {
    const container = makeContainer();
    await render(container);
    const main = container.querySelector('.deepdots-popup-main') as HTMLElement;
    const footer = container.querySelector('.deepdots-popup-footer') as HTMLElement;
    expect(footer).toBeTruthy();
    expect(main.contains(footer)).toBe(false);
    expect(footer.parentElement).toBe(main.parentElement);
  });

  it('en mobile los botones se apilan con la acción principal arriba y Back debajo', async () => {
    const container = makeContainer();
    await render(container);
    const footer = container.querySelector('.deepdots-popup-footer') as HTMLElement;
    const ids = Array.from(footer.children).map((b) => (b as HTMLElement).textContent?.trim());
    // El orden del DOM es el orden visual con `flex-direction: column` en la media query móvil.
    expect(ids[0]).toBe('Send');
    expect(ids[1]).toBe('Back');

    const responsive = document.getElementById('deepdots-responsive-styles') as HTMLStyleElement;
    expect(responsive?.textContent).toContain('flex-direction: column !important');
    expect(responsive?.textContent).not.toContain('column-reverse');
  });

  it('solo el área de preguntas hace scroll y el popup acota su alto', async () => {
    const container = makeContainer();
    await render(container);
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    const main = container.querySelector('.deepdots-popup-main') as HTMLElement;
    expect(popup.style.maxHeight).toBe('90vh');
    expect(main.style.overflowY).toBe('auto');
    // min-height:0 es lo que permite que un hijo flex encoja y active su propio scroll
    expect(main.style.minHeight).toBe('0');
  });
});
