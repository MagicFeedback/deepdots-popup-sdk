import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PopupActions } from '../types';
import type { PopupRenderOptions } from '../platform/renderer';

/**
 * Survey que no carga (popup DOM web).
 *
 * `@magicfeedback/native` avisa de que el survey NO ha cargado (clave o producto inexistentes:
 * el `GET /sdk/app/{survey}/{product}/info` devuelve 406 "Public key not found"; o sin red)
 * llamando a `onLoadedEvent({ loading: false, error })`. El popup lo trataba como una carga
 * normal: se revelaba y pintaba un Send encima de un survey vacío. Espejo del arreglo de KMP
 * (`error:load`): aviso traducido, la X sigue y el footer queda en un único Cancel que cierra.
 */

type Mode = 'error' | 'reject' | 'ok';
let mode: Mode = 'error';

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: { onLoadedEvent?: (args: unknown) => void }) => {
      if (mode === 'reject') return Promise.reject(new Error('boom'));
      if (mode === 'error') {
        options.onLoadedEvent?.({ loading: false, error: new Error('Public key not found') });
      } else {
        options.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: {} });
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

interface Rendered {
  container: HTMLElement;
  events: { type: string; data?: Record<string, unknown> }[];
  closes: number;
}

async function render(actions?: PopupActions, options?: PopupRenderOptions): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const out: Rendered = { container, events: [], closes: 0 };
  await renderPopup(
    container, 'test-survey', 'test-product', actions,
    (type, _sid, data) => { out.events.push({ type, data }); },
    () => { out.closes++; },
    'production', undefined, undefined, undefined, undefined, undefined, options,
  );
  // `generate()` no se espera dentro de renderPopup: dos ticks cubren el `.catch` también.
  await Promise.resolve();
  await Promise.resolve();
  return out;
}

const el = (c: HTMLElement, id: string) => c.querySelector(`#${id}`) as HTMLElement | null;

describe('renderPopup · survey que no carga', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mode = 'error';
  });

  it('enseña el aviso traducido en lugar del survey', async () => {
    const { container } = await render();

    const notice = el(container, 'dd-load-error');
    expect(notice?.style.display).not.toBe('none');
    expect(notice?.textContent).toBe("We couldn't load this survey.");
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(el(container, 'dd-form-wrapper')?.style.display).toBe('none');
  });

  it('sin Send: el footer solo ofrece Cancel', async () => {
    const { container } = await render();

    expect(el(container, 'dd-submit')?.style.display).toBe('none');
    expect(el(container, 'dd-back')?.style.display).toBe('none');
    expect(el(container, 'dd-start')?.style.display).toBe('none');
    expect(el(container, 'dd-complete')?.style.display).toBe('none');
    const cancel = el(container, 'dd-cancel') as HTMLButtonElement;
    expect(cancel.style.display).toBe('inline-flex');
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe('Cancel');
    expect(el(container, 'dd-footer')?.style.display).toBe('flex');
  });

  it('la X sigue visible y Cancel cierra por el mismo camino', async () => {
    const r = await render();

    expect(el(r.container, 'dd-close')?.style.display).not.toBe('none');
    el(r.container, 'dd-cancel')?.click();

    expect(r.closes).toBe(1);
    expect(r.events).toEqual([{ type: 'popup_clicked', data: { action: 'close_icon' } }]);
  });

  it('se revela ya, sin esperar al techo de la apertura diferida', async () => {
    const { container } = await render();

    expect(container.style.visibility).toBe('visible');
    expect(container.style.pointerEvents).toBe('');
  });

  it('el fallo de carga no llega al host como interacción', async () => {
    const { events } = await render();

    expect(events.filter((e) => e.type === 'popup_clicked')).toEqual([]);
  });

  it('usa el idioma del init y respeta `actions.decline.label`', async () => {
    const { container } = await render({ decline: { label: 'Luk' } } as PopupActions, { language: 'da' });

    expect(el(container, 'dd-load-error')?.textContent).toBe('Undersøgelsen kunne ikke indlæses.');
    expect(el(container, 'dd-cancel')?.textContent).toBe('Luk');
  });

  it('si `generate()` rechaza, también acaba en el estado de error', async () => {
    mode = 'reject';
    const { container } = await render();

    expect(el(container, 'dd-load-error')?.style.display).not.toBe('none');
    expect(el(container, 'dd-cancel')?.style.display).toBe('inline-flex');
  });

  it('con el survey cargado no hay rastro del aviso ni de Cancel', async () => {
    mode = 'ok';
    const { container } = await render();

    expect(el(container, 'dd-load-error')?.style.display).toBe('none');
    expect(el(container, 'dd-cancel')?.style.display).toBe('none');
    expect(el(container, 'dd-submit')?.style.display).toBe('inline-flex');
  });
});
