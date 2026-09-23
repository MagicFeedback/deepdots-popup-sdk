import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PopupActions } from '../types';
import type { PopupRenderOptions } from '../platform/renderer';
import { getLabels } from '../i18n/labels';

/**
 * Idioma del chrome del popup (botones del footer, progreso, aria-labels y avisos de error).
 *
 * El survey en sí lo localiza `@magicfeedback/native` con `formData.lang[0]`, el idioma
 * configurado en la integración; el popup no se enteraba de ese idioma y dejaba sus textos
 * siempre en inglés (un survey en danés salía con "Back"/"Send"). Aquí se fija la prioridad:
 * label de la API > idioma del survey > idioma del init > inglés.
 */

/** Controla el `formData` que el mock de @magicfeedback/native entrega en `onLoadedEvent`. */
let loadedFormData: { lang?: string[]; style?: Record<string, unknown> } | null = null;
/** `lang` que native >= 2.3 añade al evento: el idioma en el que muestra el survey. */
let loadedLang: string | undefined;
/** Opciones con las que el popup llamó a `generate()`. */
let generateOptions: Record<string, unknown> | null = null;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: { onLoadedEvent?: (args: unknown) => void }) => {
      generateOptions = options as Record<string, unknown>;
      if (loadedFormData && options.onLoadedEvent) {
        options.onLoadedEvent({ loading: false, progress: 0, total: 3, formData: loadedFormData, lang: loadedLang });
      }
      return Promise.resolve();
    },
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup } = await import('./renderPopup');

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

async function render(
  container: HTMLElement,
  actions?: PopupActions,
  options?: PopupRenderOptions,
) {
  await renderPopup(
    container,
    'test-survey',
    'test-product',
    actions,
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
  // `generate()` no se espera dentro de renderPopup: un tick para que corra onLoadedEvent.
  await Promise.resolve();
}

const text = (container: HTMLElement, id: string) =>
  (container.querySelector(`#${id}`) as HTMLElement)?.textContent;

describe('renderPopup i18n', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadedFormData = null;
    loadedLang = undefined;
    generateOptions = null;
  });

  it('pide a native el survey en el idioma del init', async () => {
    const container = makeContainer();
    await render(container, undefined, { language: 'es-ES' });

    expect(generateOptions?.lang).toBe('es-ES');
  });

  it('el idioma en que native muestra el survey gana sobre su idioma por defecto', async () => {
    // Survey multi-idioma: por defecto danés, servido en español.
    loadedFormData = { lang: ['da', 'es'], style: {} };
    loadedLang = 'es';
    const container = makeContainer();
    await render(container, undefined, { language: 'es-ES' });

    const es = getLabels('es');
    expect(text(container, 'dd-back')).toBe(es.back);
    expect(text(container, 'dd-submit')).toBe(es.accept);
  });

  it('sin idioma se queda en inglés (comportamiento previo)', async () => {
    const container = makeContainer();
    await render(container);

    expect(text(container, 'dd-back')).toBe('Back');
    expect(text(container, 'dd-start')).toBe('Start survey');
    expect(text(container, 'dd-complete')).toBe('Complete survey');
    expect(text(container, 'dd-submit')).toBe('Send');
    expect(text(container, 'dd-progress-followup')).toBe('Follow-up');
  });

  it('con idioma del init traduce botones, progreso y aria-labels', async () => {
    const container = makeContainer();
    await render(container, undefined, { language: 'da-DK' });
    const da = getLabels('da');

    expect(text(container, 'dd-back')).toBe(da.back);
    expect(text(container, 'dd-start')).toBe(da.start);
    expect(text(container, 'dd-complete')).toBe(da.complete);
    expect(text(container, 'dd-submit')).toBe(da.accept);
    expect(text(container, 'dd-progress-followup')).toBe(da.followUp);

    const close = container.querySelector('.deepdots-popup-header button') as HTMLElement;
    expect(close.getAttribute('aria-label')).toBe(da.closeAria);
    const spinner = container.querySelector('.mf-spinner') as HTMLElement;
    expect(spinner.getAttribute('aria-label')).toBe(da.loadingAria);
  });

  it('el idioma del survey (formData.lang) gana sobre el del init', async () => {
    loadedFormData = { lang: ['da'], style: {} };
    const container = makeContainer();
    await render(container, undefined, { language: 'es-ES' });

    const da = getLabels('da');
    expect(text(container, 'dd-back')).toBe(da.back);
    expect(text(container, 'dd-submit')).toBe(da.accept);
    expect(text(container, 'dd-progress-followup')).toBe(da.followUp);
  });

  it('el label de la API gana sobre el idioma del survey', async () => {
    loadedFormData = { lang: ['da'], style: {} };
    const container = makeContainer();
    await render(container, { back: { label: 'Fortryd' } }, { language: 'es-ES' });

    expect(text(container, 'dd-back')).toBe('Fortryd');
    // El resto sí se traduce al idioma del survey.
    expect(text(container, 'dd-submit')).toBe(getLabels('da').accept);
  });

  it('el contador de progreso usa el idioma resuelto', async () => {
    loadedFormData = { lang: ['da'], style: { showProgressBar: true } };
    const container = makeContainer();
    await render(container, undefined, { showProgressBar: true });

    const da = getLabels('da');
    expect(text(container, 'dd-progress-label')).toBe(`${da.question} 1 ${da.of} 3`);
  });

  it('con idioma LTR el chrome se marca explícitamente como ltr', async () => {
    const container = makeContainer();
    await render(container, undefined, { language: 'da' });
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.getAttribute('dir')).toBe('ltr');
  });

  it('con idioma árabe del init el chrome se voltea a RTL', async () => {
    // Desde 2.2.22 el survey se voltea solo (dir="rtl" en su contenedor); si el chrome se
    // quedara en LTR, media tarjeta miraría a un lado y media al otro.
    const container = makeContainer();
    await render(container, undefined, { language: 'ar-EG' });
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.getAttribute('dir')).toBe('rtl');
    // El título no puede quedar anclado a la izquierda: alineación lógica.
    const title = container.querySelector('.deepdots-popup-title') as HTMLElement;
    expect(title.style.textAlign).toBe('start');
  });

  it('el idioma del survey también decide la dirección', async () => {
    loadedFormData = { lang: ['ar'], style: {} };
    const container = makeContainer();
    await render(container, undefined, { language: 'en' });
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.getAttribute('dir')).toBe('rtl');
  });

  it('un survey LTR devuelve el chrome a ltr aunque el init fuera árabe', async () => {
    loadedFormData = { lang: ['da'], style: {} };
    const container = makeContainer();
    await render(container, undefined, { language: 'ar' });
    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.getAttribute('dir')).toBe('ltr');
  });
});
