import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSurveyHtml } from './surveyHtml';
import { BUNDLED_SURVEY_SDK_VERSION, surveySdkCssUrls, surveySdkUrls } from './surveySdkVersion';

/**
 * DD-70 en el WebView de React Native: se EJECUTA el script del HTML. Con una versión asignada,
 * su hoja sustituye a la empaquetada antes de cargar su JS; si la hoja o la JS fallan, vuelven
 * las dos empaquetadas. Nunca JS de una versión con CSS de otra.
 */

interface Harness { scripts: HTMLScriptElement[] }

function run(version: string | undefined, fetchImpl: typeof fetch): Harness {
  const html = buildSurveyHtml({ surveyId: 's-1', productId: 'p-1', version });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '').join('\n');
  document.head.innerHTML = Array.from(doc.head.querySelectorAll('style')).map((s) => s.outerHTML).join('');
  document.body.innerHTML = doc.body.innerHTML;
  const w = window as unknown as Record<string, unknown>;
  w.ReactNativeWebView = { postMessage: () => {} };
  delete w.magicfeedback;
  vi.stubGlobal('fetch', fetchImpl);
  const h: Harness = { scripts: [] };
  const realAppend = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) { h.scripts.push(node); return node; }
    return realAppend(node);
  });
  new Function(script)();
  return h;
}

const surveyCss = () => document.getElementById('dd-survey-css')!.textContent ?? '';
const sdkAttr = () => document.documentElement.getAttribute('data-survey-sdk');
const ok = (body: string) => Promise.resolve(new Response(body, { status: 200 }));
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe('surveyHtml · survey SDK asignado (DD-70)', () => {
  beforeEach(() => { document.documentElement.removeAttribute('data-survey-sdk'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('sin versión: la JS empaquetada y su hoja inline, sin pedir ninguna hoja', async () => {
    const fetchImpl = vi.fn();
    const h = run(undefined, fetchImpl as unknown as typeof fetch);
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(h.scripts[0].src).toBe(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION)[0]);
    expect(sdkAttr()).toBe(`${BUNDLED_SURVEY_SDK_VERSION} bundled`);
  });

  it('asignada: primero su hoja (sustituye a la empaquetada), luego su JS', async () => {
    const fetchImpl = vi.fn(() => ok('/* survey css 2.2.38 */'));
    const h = run('2.2.38', fetchImpl as unknown as typeof fetch);
    expect(h.scripts).toHaveLength(0); // la JS espera a la hoja
    await flush();
    expect(fetchImpl).toHaveBeenCalledWith(surveySdkCssUrls('2.2.38')[0]);
    expect(surveyCss()).toBe('/* survey css 2.2.38 */');
    expect(h.scripts[0].src).toBe(surveySdkUrls('2.2.38')[0]);
    expect(sdkAttr()).toBe('2.2.38 assigned');
  });

  it('la hoja asignada no carga (jsDelivr ni unpkg) → hoja y JS empaquetadas', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('', { status: 404 })));
    const before = run('2.2.38', fetchImpl as unknown as typeof fetch);
    const bundledCss = surveyCss();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(surveyCss()).toBe(bundledCss);
    expect(before.scripts[0].src).toBe(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION)[0]);
    expect(sdkAttr()).toBe(`${BUNDLED_SURVEY_SDK_VERSION} bundled`);
  });

  it('la JS asignada no carga → vuelve la hoja empaquetada con la JS empaquetada', async () => {
    const h = run('2.2.38', vi.fn(() => ok('/* survey css 2.2.38 */')) as unknown as typeof fetch);
    const bundledCssBefore = surveyCss();
    await flush();
    expect(bundledCssBefore).not.toBe('/* survey css 2.2.38 */');
    h.scripts[0].onerror?.(new Event('error')); // jsDelivr
    h.scripts[1].onerror?.(new Event('error')); // unpkg
    expect(h.scripts[2].src).toBe(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION)[0]);
    expect(surveyCss()).toBe(bundledCssBefore);
    expect(sdkAttr()).toBe(`${BUNDLED_SURVEY_SDK_VERSION} bundled`);
  });
});
