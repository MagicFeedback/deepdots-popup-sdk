import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup } from './renderPopup';
import { DeepdotsEventType, PopupStyle } from '../types';

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

async function render(container: HTMLElement, style?: PopupStyle) {
  const emitted: { type: DeepdotsEventType; surveyId: string }[] = [];
  await renderPopup(
    container,
    'test-survey',
    'test-product',
    undefined,
    (t, id) => emitted.push({ type: t, surveyId: id }),
    () => { container.innerHTML = ''; },
    'production',
    undefined,
    style,
  );
}

/**
 * El popup fija su propio `background`, así que tiene que fijar también
 * `color-scheme`. Si no lo hace, los controles de formulario (input/textarea/select)
 * caen al estilo por defecto del navegador y en un host con
 * `prefers-color-scheme: dark` se pintan oscuros sobre el fondo claro del popup.
 */
describe('renderPopup color-scheme', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tema light: fija color-scheme light junto al fondo claro', async () => {
    const container = makeContainer();
    await render(container, { theme: 'light', position: 'center' });

    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup).toBeTruthy();
    expect(popup.style.colorScheme).toBe('light');
    expect(popup.style.background).toBe('#fff');
  });

  it('tema dark: fija color-scheme dark junto al fondo oscuro', async () => {
    const container = makeContainer();
    await render(container, { theme: 'dark', position: 'center' });

    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.style.colorScheme).toBe('dark');
    expect(popup.style.background).toBe('#1e1e1e');
  });

  it('sin style: usa el tema light por defecto', async () => {
    const container = makeContainer();
    await render(container);

    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.style.colorScheme).toBe('light');
  });
});
