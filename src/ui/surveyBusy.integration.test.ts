import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * El survey no acepta interacción mientras carga, en las dos rutas.
 *
 * Reportado por el cliente en React Native con un vídeo: durante la transición entre páginas el
 * spinner gira pero se puede seguir marcando opciones. El spinner no tapa nada (28px en posición
 * absoluta) y `setLoading(true)` solo ocultaba el footer y deshabilitaba SUS botones. Al cambiar
 * de opción ahí, la respuesta de esa página ya se había enviado: el cambio no viajaba con ella.
 */

/** Deja disparar `beforeSubmitEvent` desde el test, que es cuando empieza la transición. */
let capturedOptions: { beforeSubmitEvent?: () => void; afterSubmitEvent?: (p: unknown) => void } | null = null;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: Record<string, unknown>) => {
      capturedOptions = options as typeof capturedOptions;
      (options.onLoadedEvent as ((a: unknown) => void) | undefined)?.({
        loading: false, progress: 0, total: 3, formData: {},
      });
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

describe('popup DOM (web) · el survey se bloquea mientras carga', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    document.body.innerHTML = '';
    capturedOptions = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderPopup(container, 's-1', 'p-1', undefined, () => {}, () => {}, 'production');
    await Promise.resolve();
    await Promise.resolve();
  });

  it('con el survey cargado, el contenido acepta interacción', () => {
    const wrapper = container.querySelector('#dd-form-wrapper') as HTMLElement;

    expect(wrapper.style.pointerEvents).not.toBe('none');
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
  });

  it('al enviar una página, el contenido deja de aceptarla', () => {
    capturedOptions?.beforeSubmitEvent?.();

    const wrapper = container.querySelector('#dd-form-wrapper') as HTMLElement;
    expect(wrapper.style.pointerEvents).toBe('none');
    expect(wrapper.getAttribute('aria-busy')).toBe('true');
  });

  it('al llegar la página siguiente, vuelve a aceptarla', () => {
    capturedOptions?.beforeSubmitEvent?.();
    capturedOptions?.afterSubmitEvent?.({ completed: false, progress: 1, total: 3 });

    const wrapper = container.querySelector('#dd-form-wrapper') as HTMLElement;
    expect(wrapper.style.pointerEvents).not.toBe('none');
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
  });

  it('un error de validación también lo suelta (si no, la pantalla queda muerta)', () => {
    capturedOptions?.beforeSubmitEvent?.();
    capturedOptions?.afterSubmitEvent?.({ error: 'No response', completed: false, progress: 0, total: 3 });

    const wrapper = container.querySelector('#dd-form-wrapper') as HTMLElement;
    expect(wrapper.style.pointerEvents).not.toBe('none');
  });
});

describe('WebView (React Native) · el survey se bloquea mientras carga', () => {
  it('bloquea el wrapper dentro de setLoading, no solo el footer', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

    expect(html).toContain("var formWrapper=document.getElementById('dd-form-wrapper')");
    expect(html).toMatch(/function setLoading\(isLoading\)\{[\s\S]*?ddSetSurveyBusy\(formWrapper, isLoading\);/);
  });

  it('lleva el mismo bloqueo que la ruta del navegador', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

    expect(html).toContain('function ddSetSurveyBusy(el, busy)');
    expect(html).toContain("el.style.pointerEvents = busy ? 'none' : ''");
    expect(html).toContain("el.setAttribute('aria-busy'");
  });
});
