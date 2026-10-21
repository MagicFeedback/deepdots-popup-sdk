import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup } from './renderPopup';
import type { PopupRenderOptions } from '../platform/renderer';
import type { PopupStyle } from '../types';

/**
 * Con una CSP estricta (`style-src 'nonce-…'`, sin `'unsafe-inline'`) el navegador bloquea
 * cualquier `<style>` que no lleve el nonce de la página. El popup inyecta varias hojas en el
 * `<head>` (la del survey, alineación, spinner, responsive, CSS del host y `@font-face`), y sin
 * nonce el survey sale sin estilos. Verificado en Chromium con una app Angular con nonce.
 */
const STYLE_IDS = [
  'magicfeedback-sdk-styles',
  'deepdots-survey-alignment',
  'deepdots-spinner-styles',
  'deepdots-responsive-styles',
  'deepdots-custom-css',
  'deepdots-font-face',
];

const FONT_STYLE: PopupStyle = { font: { family: 'Inter', url: 'https://fonts.example.com/inter.woff2' } } as PopupStyle;

async function render(options?: PopupRenderOptions, style: PopupStyle = FONT_STYLE) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderPopup(
    container, 'test-survey', 'test-product', undefined, () => {}, () => { container.innerHTML = ''; },
    'production', undefined, style, undefined, undefined, undefined, options,
  );
}

describe('renderPopup — nonce de CSP en los <style> inyectados', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('con cspNonce, todas las hojas que inyecta llevan el nonce', async () => {
    await render({ cspNonce: 'abc123', surveyCss: '.x{color:red}' });
    for (const id of STYLE_IDS) {
      const el = document.getElementById(id);
      expect(el, id).toBeTruthy();
      expect(el?.getAttribute('nonce'), id).toBe('abc123');
    }
  });

  it('no queda ningún <style> del head sin nonce', async () => {
    await render({ cspNonce: 'abc123', surveyCss: '.x{color:red}' });
    const sinNonce = Array.from(document.head.querySelectorAll('style')).filter((s) => !s.getAttribute('nonce'));
    expect(sinNonce.map((s) => s.id)).toEqual([]);
  });

  it('sin cspNonce no añade el atributo (comportamiento de siempre)', async () => {
    await render({ surveyCss: '.x{color:red}' });
    for (const id of STYLE_IDS) {
      expect(document.getElementById(id)?.hasAttribute('nonce'), id).toBe(false);
    }
  });

  it('una hoja ya inyectada sin nonce se recrea con él (el navegador no re-evalúa un nonce tardío)', async () => {
    await render({ surveyCss: '.x{color:red}' });
    await render({ cspNonce: 'abc123', surveyCss: '.x{color:red}' });
    for (const id of STYLE_IDS) {
      expect(document.querySelectorAll(`#${id}`).length, id).toBe(1);
      expect(document.getElementById(id)?.getAttribute('nonce'), id).toBe('abc123');
    }
  });

  it('un nonce vacío o en blanco se ignora', async () => {
    await render({ cspNonce: '   ' });
    expect(document.getElementById('magicfeedback-sdk-styles')?.hasAttribute('nonce')).toBe(false);
  });
});
