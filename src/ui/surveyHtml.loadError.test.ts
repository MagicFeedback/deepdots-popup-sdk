import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSurveyHtml, type BuildSurveyHtmlOptions } from './surveyHtml';
import { LABELS } from '../i18n/labels';

/**
 * Survey que no carga, dentro del WebView de React Native.
 *
 * `@magicfeedback/native` avisa del fallo (406 "Public key not found", sin red) con
 * `onLoadedEvent({ loading: false, error })`. El HTML lo tomaba por una carga normal: emitía
 * `loaded` y pintaba un Send sobre un survey vacío. Espejo de KMP: emite `error:load` con
 * `{message}`, enseña el aviso traducido, deja la X y un único Cancel, y se revela ya (con
 * `ready`, para el host que difiere el montaje).
 *
 * Aquí se EJECUTA el script del HTML (no solo se buscan strings): el bundle del CDN se sustituye
 * por un `window.magicfeedback` falso y la etiqueta `<script src>` no llega a insertarse.
 */

type LoadedArgs = Record<string, unknown>;

interface Harness {
  messages: { name: string; payload: Record<string, unknown> }[];
  raw: string[];
  cdnScript: HTMLScriptElement | null;
}

function run(opts: Partial<BuildSurveyHtmlOptions>, loaded: LoadedArgs | 'none'): Harness {
  const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', ...opts });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '').join('\n');
  document.head.innerHTML = '';
  document.body.innerHTML = doc.body.innerHTML;
  document.body.className = '';

  const h: Harness = { messages: [], raw: [], cdnScript: null };
  const w = window as unknown as Record<string, unknown>;
  w.ReactNativeWebView = {
    postMessage: (s: string) => {
      h.raw.push(s);
      try { h.messages.push(JSON.parse(s)); } catch { /* mensaje simple */ }
    },
  };
  if (loaded !== 'none') {
    w.magicfeedback = {
      init: () => {},
      form: () => ({
        progress: 0,
        total: 3,
        generate: (_id: string, o: { onLoadedEvent?: (a: LoadedArgs) => void }) => {
          o.onLoadedEvent?.(loaded);
          return Promise.resolve();
        },
      }),
    };
  } else {
    delete w.magicfeedback;
  }
  const realAppend = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) { h.cdnScript = node; return node; }
    return realAppend(node);
  });

  new Function(script)();
  // El script arranca `initMF()` desde un intervalo de 150 ms.
  vi.advanceTimersByTime(200);
  return h;
}

const el = (id: string) => document.getElementById(id) as HTMLElement;
const names = (h: Harness) => h.messages.map((m) => m.name);

describe('surveyHtml · survey que no carga', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const failed = { loading: false, error: new Error('Public key not found') };

  it('emite `error:load` con el motivo, y no `loaded`', () => {
    const h = run({}, failed);

    expect(names(h)).not.toContain('loaded');
    const err = h.messages.find((m) => m.name === 'error:load');
    expect(err?.payload).toEqual({ message: 'Public key not found' });
  });

  it('enseña el aviso traducido y oculta el survey', () => {
    run({}, failed);

    expect(el('dd-load-error').style.display).toBe('block');
    expect(el('dd-load-error').textContent).toBe(LABELS.en.errorLoad);
    expect(el('dd-form-wrapper').style.display).toBe('none');
  });

  it('sin Send: solo Cancel, y la X sigue', () => {
    run({}, failed);

    for (const id of ['dd-submit', 'dd-back', 'dd-start', 'dd-complete']) {
      expect(el(id).style.display, id).toBe('none');
    }
    expect(el('dd-cancel').style.display).toBe('inline-flex');
    expect((el('dd-cancel') as HTMLButtonElement).disabled).toBe(false);
    expect(el('dd-cancel').textContent).toBe('Cancel');
    expect(el('dd-footer').style.display).toBe('flex');
    expect(el('dd-close').style.display).not.toBe('none');
  });

  it('Cancel cierra por el mismo camino que la X (`popup_close`)', () => {
    const h = run({}, failed);

    el('dd-cancel').click();
    el('dd-close').click();

    expect(names(h).filter((n) => n === 'popup_close')).toHaveLength(2);
  });

  it('se revela ya y manda `ready`, sin esperar al techo', () => {
    const h = run({}, failed);

    expect(document.body.classList.contains('dd-ready')).toBe(true);
    expect(names(h)).toContain('ready');
  });

  it('usa el idioma del init y respeta `actions.decline.label`', () => {
    run({ language: 'da', actions: { decline: { label: 'Luk' } } as BuildSurveyHtmlOptions['actions'] }, failed);

    expect(el('dd-load-error').textContent).toBe('Undersøgelsen kunne ikke indlæses.');
    expect(el('dd-cancel').textContent).toBe('Luk');
  });

  it('si el bundle del CDN no carga (sin red), acaba en el mismo estado', () => {
    const h = run({}, 'none');
    h.cdnScript?.onerror?.(new Event('error'));

    expect(names(h)).toContain('error:load');
    expect(names(h)).toContain('ready');
    expect(el('dd-load-error').style.display).toBe('block');
    expect(el('dd-cancel').style.display).toBe('inline-flex');
  });

  it('con el survey cargado no hay rastro del aviso ni de Cancel', () => {
    const h = run({}, { loading: false, progress: 0, total: 3, formData: {} });

    expect(names(h)).toContain('loaded');
    expect(names(h)).not.toContain('error:load');
    expect(el('dd-load-error').style.display).not.toBe('block');
    expect(el('dd-cancel').style.display).toBe('none');
    expect(el('dd-submit').style.display).toBe('inline-flex');
  });
});
