import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PopupStyle } from '../types';

/**
 * Un popup sin velo (esquinas y bordes) no puede bloquear la página del host.
 *
 * El contenedor ocupa siempre toda la pantalla, porque es lo que alinea la tarjeta en su
 * esquina. Con `center` lleva un velo oscuro y el popup es modal: tapar la página es lo
 * esperado. En el resto de posiciones el fondo es transparente, y si el contenedor se quedaba
 * con los clics el usuario veía la tienda pero no podía tocarla (MF-3245, `corner-overlay`).
 */

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 1,
    generate: (_divId: string, options: { onLoadedEvent?: (args: unknown) => void }) => {
      options.onLoadedEvent?.({ loading: false, progress: 0, total: 1, formData: {} });
      return Promise.resolve();
    },
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup } = await import('./renderPopup');

async function render(position: PopupStyle['position']) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderPopup(container, 'test-survey', 'test-product', undefined, () => {}, () => {}, 'production', undefined, {
    theme: 'light',
    position,
  });
  await Promise.resolve();
  await Promise.resolve();
  const popup = container.querySelector('.deepdots-popup') as HTMLElement;
  return { container, popup };
}

describe('renderPopup · capa del contenedor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  for (const position of ['bottom', 'bottom-right', 'bottom-left', 'top', 'top-right', 'top-left'] as const) {
    it(`${position}: el contenedor deja pasar los clics y la tarjeta los recibe`, async () => {
      const { container, popup } = await render(position);

      expect(container.style.visibility).toBe('visible');
      expect(container.style.background).toBe('transparent');
      expect(container.style.pointerEvents).toBe('none');
      expect(popup.style.pointerEvents).toBe('auto');
    });
  }

  it('center: con velo el contenedor sigue capturando los clics (popup modal)', async () => {
    const { container, popup } = await render('center');

    expect(container.style.visibility).toBe('visible');
    expect(container.style.pointerEvents).toBe('');
    expect(popup.style.pointerEvents).toBe('auto');
  });
});
