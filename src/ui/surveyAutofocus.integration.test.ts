import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Foco automático en la primera pregunta de escribir.
 *
 * Lo pone `@magicfeedback/native` con su opción `autofocus`: el popup le pasa `'navigation'`
 * (tras Start, Siguiente o Atrás) y solo decide la apertura, porque native no sabe cuándo se
 * revela el popup y un campo invisible no acepta foco. Al abrir, solo con ratón o trackpad: en
 * táctil sacaría el teclado sin que el usuario haya tocado nada.
 */

type Opts = {
  autofocus?: unknown;
  onLoadedEvent?: (a: unknown) => void;
  afterSubmitEvent?: (p: unknown) => void;
  onBackEvent?: (p: unknown) => void;
};
let captured: Opts | null = null;
/** Estado del contenedor del popup en el momento de cada llamada a `focusFirstQuestion`. */
let focusCalls: string[] = [];
let popupContainer: HTMLElement | null = null;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: Opts) => {
      captured = options;
      options.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: {} });
      return Promise.resolve();
    },
    focusFirstQuestion: () => {
      focusCalls.push(popupContainer?.style.visibility ?? '');
      return true;
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

async function open() {
  popupContainer = document.createElement('div');
  document.body.appendChild(popupContainer);
  await renderPopup(popupContainer, 's-1', 'p-1', undefined, () => {}, () => {}, 'production');
  // La revelación espera a que el popup esté pintado (imágenes incluidas): sin imágenes es un tick.
  await vi.waitFor(() => expect(popupContainer?.style.visibility).toBe('visible'));
}

describe('popup DOM (web) · foco en la primera pregunta de escribir', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    document.body.innerHTML = '';
    captured = null;
    focusCalls = [];
  });
  afterEach(() => { window.matchMedia = original; });

  it('delega la navegación en native con autofocus: navigation', async () => {
    pointer(false);
    await open();

    expect(captured?.autofocus).toBe('navigation');
  });

  it('en escritorio, al abrir pide el foco una vez, con el popup ya visible', async () => {
    pointer(true);
    await open();

    // Un campo con `visibility:hidden` no acepta foco: tiene que llegar tras la revelación.
    expect(focusCalls).toEqual(['visible']);
  });

  it('en táctil, al abrir no lo pide (no saca el teclado sin que el usuario toque nada)', async () => {
    pointer(false);
    await open();

    expect(focusCalls).toEqual([]);
  });

  it('al navegar no lo pide el popup: lo hace native, después de que el popup suelte el inert', async () => {
    pointer(true);
    await open();
    focusCalls = [];

    captured?.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: {} }); // tras Start
    captured?.afterSubmitEvent?.({ completed: false, progress: 1, total: 3 });
    captured?.onBackEvent?.({ progress: 0, followup: false });

    expect(focusCalls).toEqual([]);
  });
});

describe('WebView (React Native) · foco en la primera pregunta de escribir', () => {
  const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

  it('delega la navegación en native con autofocus: navigation', () => {
    expect(html).toMatch(/form\.generate\('mf', \{[\s\S]*?autofocus:'navigation',/);
  });

  it('al abrir pide el foco a native cuando el popup se ha revelado y el survey ha cargado', () => {
    expect(html).toMatch(/ddCreateReveal\(popup, function\(\)\{[\s\S]*?ddRevealed=true;\s*ddAutofocusOnOpen\(\);/);
    expect(html).toMatch(/if\(!ddSurveyLoaded\)\{ ddSurveyLoaded=true; ddAutofocusOnOpen\(\); \}/);
    expect(html).toContain("window.matchMedia('(pointer: fine)').matches");
    expect(html).toContain("if(fine && f && typeof f.focusFirstQuestion==='function'){ f.focusFirstQuestion(); }");
  });

  it('no lleva lógica de foco propia al navegar', () => {
    expect(html).not.toContain('ddAutofocusFirstTextQuestion');
  });
});
