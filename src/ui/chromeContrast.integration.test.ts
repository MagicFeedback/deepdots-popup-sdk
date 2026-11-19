import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PopupStyle } from '../types';
import { buildSurveyHtml } from './surveyHtml';
import { CHROME_CONTRAST_JS } from './chromeContrast';

/**
 * DD-247: los textos del chrome (título, X, progreso, Back) y `color-scheme` salen de la
 * luminancia del fondo final de la tarjeta. El Style del survey (`boxBackgroundColor`) manda;
 * `theme` solo es el fondo por defecto cuando el Style no trae uno.
 */

let loadedStyle: Record<string, unknown> | null = null;
let finishOnLoad = false;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: { onLoadedEvent?: (args: unknown) => void; afterSubmitEvent?: (args: unknown) => void }) => {
      if (loadedStyle && options.onLoadedEvent) {
        options.onLoadedEvent({ loading: false, progress: 0, total: 3, formData: { style: loadedStyle } });
      }
      if (finishOnLoad) options.afterSubmitEvent?.({ completed: true, progress: 3, total: 3 });
      return Promise.resolve();
    },
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup } = await import('./renderPopup');

async function render(style?: PopupStyle) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderPopup(
    container, 's-1', 'p-1', undefined, () => {}, () => { container.innerHTML = ''; },
    'production', undefined, style,
  );
  await Promise.resolve();
  const q = (sel: string) => container.querySelector(sel) as HTMLElement;
  return { popup: q('.deepdots-popup'), back: q('#dd-back') };
}

describe('popup DOM (web) · contraste del chrome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadedStyle = null;
    finishOnLoad = false;
  });

  // DD-248: el gracias está fuera del contenedor del survey, donde el gris del CSS del survey
  // seguía siendo el de modo claro.
  it('pantalla final en tarjeta oscura: texto claro también en los <p>', async () => {
    loadedStyle = { boxBackgroundColor: '#0f172a' };
    finishOnLoad = true;
    const { popup } = await render();
    const done = popup.querySelector('.deepdots-success') as HTMLElement;

    expect(done.style.color).toBe('#f0f0f0');
    expect(done.style.getPropertyValue('--mf-text-secondary')).toBe('#f0f0f0');
  });

  it('pantalla final en tarjeta clara: no toca el gris del survey', async () => {
    loadedStyle = { boxBackgroundColor: '#ffffff' };
    finishOnLoad = true;
    const { popup } = await render();
    const done = popup.querySelector('.deepdots-success') as HTMLElement;

    expect(done.style.getPropertyValue('--mf-text-secondary')).toBe('');
  });

  it('Style oscuro con theme light por defecto: textos claros y color-scheme dark', async () => {
    loadedStyle = { boxBackgroundColor: '#0f172a' };
    const { popup, back } = await render();

    expect(popup.style.colorScheme).toBe('dark');
    expect(back.style.color).toBe('#9ca3af');
    expect(popup.querySelector('h2')!.style.color).toBe('#f0f0f0');
  });

  it('Style claro con theme dark: textos oscuros y color-scheme light', async () => {
    loadedStyle = { boxBackgroundColor: '#ffffff' };
    const { popup, back } = await render({ theme: 'dark', position: 'center' } as PopupStyle);

    expect(popup.style.colorScheme).toBe('light');
    expect(back.style.color).toBe('#6b7280');
    expect(popup.querySelector('h2')!.style.color).toBe('#111');
  });

  it('sin boxBackgroundColor manda el theme, como siempre', async () => {
    loadedStyle = { primaryColor: '#00aeef' };
    const { popup } = await render({ theme: 'dark', position: 'center' } as PopupStyle);

    expect(popup.style.background).toBe('#1e1e1e');
    expect(popup.style.colorScheme).toBe('dark');
  });

  it('un color que no se puede leer no cambia la paleta', async () => {
    loadedStyle = { boxBackgroundColor: 'var(--brand)' };
    const { popup } = await render();

    expect(popup.style.colorScheme).toBe('light');
  });

  it('buttonSecondaryColor sigue mandando sobre el Back', async () => {
    loadedStyle = { boxBackgroundColor: '#000000', buttonSecondaryColor: '#ff0000' };
    const { back } = await render();

    expect(back.style.color).toBe('#ff0000');
  });
});

/** `ddApplyChromeContrast` tal y como va dentro del HTML del WebView. */
function loadWebViewApply(): (bg: string) => void {
  const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });
  const fn = /function ddApplyChromeContrast\(bg\)\{[\s\S]*?\n\}/.exec(html);
  expect(fn).toBeTruthy();
  return new Function(`${CHROME_CONTRAST_JS}\n${fn![0]}\nreturn ddApplyChromeContrast;`)() as (bg: string) => void;
}

describe('WebView (React Native) · contraste del chrome', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="color-scheme" content="light">';
    document.body.innerHTML = '<div id="dd-popup"></div>';
  });

  it('los colores del chrome van por variables CSS, para que el surveyCss del host siga ganando', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', surveyCss: '#dd-title{color:red}' });

    expect(html).toContain('#dd-title{margin:0;');
    expect(html).toMatch(/#dd-title\{[^}]*color:var\(--dd-text-primary,#111\)/);
    expect(html).toMatch(/#dd-close\{[^}]*color:var\(--dd-text-primary,#111\)/);
    expect(html).toContain('color-scheme:var(--dd-color-scheme,light)');
    // El CSS del host va el último.
    expect(html.lastIndexOf('#dd-title{color:red}')).toBeGreaterThan(html.indexOf('--dd-text-primary,#111'));
  });

  it('se aplica al cargar el Style, y solo con chrome', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });

    // DD-241: el fondo final lo calcula ddChromeColors (Style + theme + modo de la app).
    expect(html).toContain('ddApplyAppearanceColors(s);');
    expect(html).toContain('if(chromeOn){ popup.style.background=c.background; ddApplyChromeContrast(c.background); }');
  });

  it('fondo oscuro: variables dark y meta color-scheme dark', () => {
    loadWebViewApply()('#111111');
    const el = document.getElementById('dd-popup')!;

    expect(el.style.getPropertyValue('--dd-text-primary')).toBe('#f0f0f0');
    expect(el.style.getPropertyValue('--dd-text-muted')).toBe('#9ca3af');
    expect(el.style.getPropertyValue('--dd-progress-track')).toBe('#3f3f46');
    expect(el.style.getPropertyValue('--dd-color-scheme')).toBe('dark');
    expect(el.style.getPropertyValue('--dd-success-text')).toBe('#f0f0f0');
    expect(document.querySelector('meta[name="color-scheme"]')!.getAttribute('content')).toBe('dark');
  });

  it('fondo claro: variables light', () => {
    loadWebViewApply()('#fafafa');
    const el = document.getElementById('dd-popup')!;

    expect(el.style.getPropertyValue('--dd-text-primary')).toBe('#111');
    expect(el.style.getPropertyValue('--dd-color-scheme')).toBe('light');
    expect(el.style.getPropertyValue('--dd-success-text')).toBe('');
  });

  it('pantalla final: el texto usa --dd-success-text en oscuro y el gris del survey en claro (DD-248)', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });
    expect(html).toContain('.deepdots-success p{margin:0;font-size:16px;font-weight:600;line-height:1.4;color:var(--dd-success-text,var(--mf-text-secondary))}');
  });

  it('color ilegible: no toca nada', () => {
    loadWebViewApply()('url(x)');
    const el = document.getElementById('dd-popup')!;

    expect(el.style.getPropertyValue('--dd-text-primary')).toBe('');
  });
});
