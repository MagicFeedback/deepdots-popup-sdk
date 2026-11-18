import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PopupStyle } from '../types';
import type { Appearance } from './appearance';
import { buildSurveyHtml } from './surveyHtml';

/**
 * DD-241: claro/oscuro desde la app. El popup DOM pinta el marco con el modo y los colores `dark`
 * del Style (DD-239), y el survey recibe `mode` (DD-238). El HTML de React Native igual.
 */

let loadedStyle: Record<string, unknown> | null = null;
let lastGenerateOptions: Record<string, unknown> | null = null;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (_divId: string, options: Record<string, unknown> & { onLoadedEvent?: (args: unknown) => void }) => {
      lastGenerateOptions = options;
      if (loadedStyle && options.onLoadedEvent) {
        options.onLoadedEvent({ loading: false, progress: 0, total: 3, formData: { style: loadedStyle } });
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

function mockSystemDark(dark: boolean) {
  const listeners: (() => void)[] = [];
  const mq = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => {},
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mq));
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

async function render(appearance?: Appearance, style?: PopupStyle) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderPopup(
    container, 's-1', 'p-1', undefined, () => {}, () => { container.innerHTML = ''; },
    'production', undefined, style, undefined, undefined, undefined, { appearance },
  );
  await Promise.resolve();
  const q = (sel: string) => container.querySelector(sel) as HTMLElement;
  return { popup: q('.deepdots-popup'), submit: q('#dd-submit'), title: q('.deepdots-popup h2') };
}

const rgb = (hex: string) => {
  const el = document.createElement('div');
  el.style.background = hex;
  return el.style.background;
};

describe('popup DOM (web) · appearance de la app', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadedStyle = null;
    lastGenerateOptions = null;
    mockSystemDark(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin appearance no cambia nada: Style claro, sin `mode` al survey', async () => {
    loadedStyle = { boxBackgroundColor: '#ffffff', buttonPrimaryColor: '#3D5FA8' };
    const { popup, submit } = await render();

    expect(popup.style.colorScheme).toBe('light');
    expect(submit.style.background).toBe(rgb('#3D5FA8'));
    expect(submit.style.color).toBe(rgb('#fff'));
    expect(lastGenerateOptions).not.toHaveProperty('mode');
  });

  it('dark: usa el bloque dark del Style y pasa mode dark al survey', async () => {
    loadedStyle = {
      boxBackgroundColor: '#ffffff',
      buttonPrimaryColor: '#3D5FA8',
      dark: { boxBackgroundColor: '#14161B', buttonPrimaryColor: '#8EAAF0' },
    };
    const { popup, submit, title } = await render('dark');

    expect(lastGenerateOptions).toMatchObject({ mode: 'dark' });
    expect(popup.style.background).toBe(rgb('#14161B'));
    expect(popup.style.colorScheme).toBe('dark');
    expect(title.style.color).toBe(rgb('#f0f0f0'));
    expect(submit.style.background).toBe(rgb('#8EAAF0'));
    expect(submit.style.color).toBe(rgb('#0F172A'));
  });

  it('dark sin colores dark ni marca: oscuro por defecto y botón claro', async () => {
    loadedStyle = { boxBackgroundColor: '#ffffff' };
    const { popup, submit } = await render('dark');

    expect(popup.style.background).toBe(rgb('#1e1e1e'));
    expect(submit.style.background).toBe(rgb('#E2E8F0'));
  });

  it('light forzado sobre theme dark: tarjeta blanca', async () => {
    loadedStyle = {};
    const { popup } = await render('light', { theme: 'dark', position: 'center' } as PopupStyle);

    expect(lastGenerateOptions).toMatchObject({ mode: 'light' });
    expect(popup.style.background).toBe(rgb('#fff'));
    expect(popup.style.colorScheme).toBe('light');
  });

  it('system sigue al sistema al abrir y el marco cambia en vivo', async () => {
    const system = mockSystemDark(true);
    loadedStyle = { boxBackgroundColor: '#ffffff' };
    const { popup } = await render('system');

    expect(lastGenerateOptions).toMatchObject({ mode: 'dark' });
    expect(popup.style.colorScheme).toBe('dark');

    system.set(false);
    expect(popup.style.colorScheme).toBe('light');
    expect(popup.style.background).toBe(rgb('#ffffff'));
  });
});

describe('WebView (React Native) · appearance de la app', () => {
  it('sin appearance no pasa mode y la paleta inicial es la del theme', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1' });
    expect(html).toContain('var ddForcedMode=ddResolveForcedMode(null);');
    expect(html).toContain("mode: ddForcedMode||undefined,");
    expect(html).toContain('<meta name="color-scheme" content="light"/>');
  });

  it('dark fija la paleta inicial oscura y se resuelve dentro del WebView', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', appearance: 'dark' });
    expect(html).toContain('var ddForcedMode=ddResolveForcedMode("dark");');
    expect(html).toContain('<meta name="color-scheme" content="dark"/>');
  });

  it('system se resuelve en el WebView (prefers-color-scheme)', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', appearance: 'system', theme: 'light' });
    expect(html).toContain('var ddForcedMode=ddResolveForcedMode("system");');
    expect(html).toContain('<meta name="color-scheme" content="light"/>');
  });

  it('un valor desconocido se ignora', () => {
    const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', appearance: 'auto' as never });
    expect(html).toContain('var ddForcedMode=ddResolveForcedMode(null);');
  });
});
