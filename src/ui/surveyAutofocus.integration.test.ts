import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Foco automático en la primera pregunta de escribir, enganchado en las dos rutas.
 *
 * - Al abrir: solo con puntero fino (escritorio). En táctil el teclado taparía el popup sin que
 *   el usuario haya hecho nada.
 * - Al navegar (Start, Siguiente, Atrás): siempre, porque el usuario acaba de pulsar.
 */

type Opts = {
  onLoadedEvent?: (a: unknown) => void;
  beforeSubmitEvent?: () => void;
  afterSubmitEvent?: (p: unknown) => void;
  onBackEvent?: (p: unknown) => void;
};
let captured: Opts | null = null;
let hostId = '';
/** Marcado de la primera página que pinta el survey simulado. */
let firstPage = '';

/** Lo que hace `@magicfeedback/native` en cada página: vaciar el formulario y repintarlo. */
function paint(inner: string) {
  const host = document.getElementById(hostId) as HTMLElement;
  host.innerHTML = `<div class="magicfeedback-div"><label>Q</label>${inner}</div>`;
}

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (divId: string, options: Opts) => {
      captured = options;
      hostId = divId;
      if (firstPage) paint(firstPage);
      options.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: {} });
      return Promise.resolve();
    },
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup } = await import('./renderPopup');
const { buildSurveyHtml } = await import('./surveyHtml');

function pointer(fine: boolean) {
  window.matchMedia = ((q: string) => ({ matches: fine && q === '(pointer: fine)', media: q })) as unknown as typeof window.matchMedia;
}

async function open(page: string) {
  firstPage = page;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderPopup(container, 's-1', 'p-1', undefined, () => {}, () => {}, 'production');
  // La revelación espera a que el popup esté pintado (imágenes incluidas): sin imágenes es un tick.
  await vi.waitFor(() => expect(container.style.visibility).toBe('visible'));
  return container;
}

describe('popup DOM (web) · foco en la primera pregunta de escribir', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    document.body.innerHTML = '';
    captured = null;
  });
  afterEach(() => { window.matchMedia = original; });

  it('en escritorio, al abrir enfoca la pregunta de texto', async () => {
    pointer(true);
    const container = await open('<input type="text">');

    expect(document.activeElement).toBe(container.querySelector('input'));
  });

  it('en táctil, al abrir no enfoca (no abre el teclado sin que el usuario toque nada)', async () => {
    pointer(false);
    const container = await open('<input type="text">');

    expect(document.activeElement).not.toBe(container.querySelector('input'));
  });

  it('en táctil, al pasar de página sí enfoca la siguiente si es de escribir', async () => {
    pointer(false);
    const container = await open('<input type="radio">');

    captured?.beforeSubmitEvent?.();
    paint('<textarea></textarea>');
    captured?.afterSubmitEvent?.({ completed: false, progress: 1, total: 3 });

    expect(document.activeElement).toBe(container.querySelector('textarea'));
  });

  it('al volver atrás enfoca la pregunta de escribir de esa página', async () => {
    pointer(false);
    const container = await open('<input type="radio">');

    paint('<input type="email">');
    captured?.onBackEvent?.({ progress: 0, followup: false });

    expect(document.activeElement).toBe(container.querySelector('input[type="email"]'));
  });

  it('tras Start (segunda carga del survey) enfoca también en táctil', async () => {
    pointer(false);
    const container = await open(''); // pantalla de bienvenida: sin preguntas

    paint('<input type="text">');
    captured?.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: {} });

    expect(document.activeElement).toBe(container.querySelector('input'));
  });

  it('si la primera pregunta no es de escribir, no toca el foco', async () => {
    pointer(true);
    const container = await open('<input type="radio"><input type="text">');

    expect(container.contains(document.activeElement)).toBe(false);
  });
});

describe('WebView (React Native) · foco en la primera pregunta de escribir', () => {
  const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

  it('lleva el mismo algoritmo que la ruta del navegador', () => {
    expect(html).toContain('function ddAutofocusFirstTextQuestion(root, trigger)');
  });

  it('al abrir, enfoca solo cuando el popup se ha revelado y el survey ha cargado', () => {
    expect(html).toMatch(/ddCreateReveal\(popup, function\(\)\{[\s\S]*?ddRevealed=true;\s*ddAutofocusOnOpen\(\);/);
    expect(html).toMatch(/if\(!ddSurveyLoaded\)\{ ddSurveyLoaded=true; ddAutofocusOnOpen\(\); \}/);
    expect(html).toContain("ddAutofocusFirstTextQuestion(formWrapper, 'open')");
  });

  it('al navegar (Start, Siguiente, Atrás) enfoca la página nueva', () => {
    const navigations = html.match(/ddAutofocusFirstTextQuestion\(formWrapper, 'navigation'\)/g) ?? [];
    expect(navigations).toHaveLength(3);
  });
});
