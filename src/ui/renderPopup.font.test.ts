import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup } from './renderPopup';
import { buildFontFamilyValue, buildFontFaceCss } from './font';
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

describe('renderPopup font DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('deepdots-font-face')?.remove();
  });

  it('con family + url: fija --deepdots-font e inyecta un único @font-face', async () => {
    const container = makeContainer();
    await render(container, { theme: 'light', position: 'center', font: { family: 'Inter', url: 'https://x.com/Inter.woff2' } });

    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup).toBeTruthy();
    expect(popup.style.getPropertyValue('--deepdots-font')).toBe(buildFontFamilyValue('Inter'));

    const faces = document.head.querySelectorAll('#deepdots-font-face');
    expect(faces.length).toBe(1);
    expect((faces[0] as HTMLStyleElement).textContent).toBe(buildFontFaceCss('Inter', 'https://x.com/Inter.woff2'));
  });

  it('con family sin url: fija --deepdots-font pero NO inyecta @font-face', async () => {
    const container = makeContainer();
    await render(container, { theme: 'light', position: 'center', font: { family: 'Inter' } });

    const popup = container.querySelector('.deepdots-popup') as HTMLElement;
    expect(popup.style.getPropertyValue('--deepdots-font')).toBe(buildFontFamilyValue('Inter'));
    expect(document.getElementById('deepdots-font-face')).toBeNull();
  });

  it('dedup: dos renders con la misma fuente dejan un único #deepdots-font-face', async () => {
    const font = { family: 'Inter', url: 'https://x.com/Inter.woff2' };
    await render(makeContainer(), { theme: 'light', position: 'center', font });
    await render(makeContainer(), { theme: 'light', position: 'center', font });

    expect(document.head.querySelectorAll('#deepdots-font-face').length).toBe(1);
  });
});
