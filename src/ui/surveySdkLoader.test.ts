import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@magicfeedback/native', () => ({ default: { init: () => {}, form: () => ({}), __bundled: true } }));

import { loadUmdScript, resetSurveySdkCache, resolveSurveySdk } from './surveySdkLoader';
import { BUNDLED_SURVEY_SDK_VERSION, surveySdkUrls } from './surveySdkVersion';
import { setLogger } from '../util/logger';
import type { DeepdotsLogger } from '../types';

/** DD-70: carga del survey SDK asignado en el popup DOM web. */
const fake = (tag: string) => ({ init: () => {}, form: () => ({}), tag });
const bundled = fake('bundled');
const loadCss = vi.fn(async (v: string) => `/* css ${v} */ .deepdots-popup{}`);

describe('resolveSurveySdk', () => {
  let logger: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resetSurveySdkCache();
    logger = { log: vi.fn(), warn: vi.fn() };
    setLogger(logger as unknown as DeepdotsLogger);
  });
  afterEach(() => setLogger(undefined));

  it('sin versión asignada: la empaquetada, sin descargar nada y sin log (sin debug)', async () => {
    const loadScript = vi.fn();
    const r = await resolveSurveySdk(undefined, {}, { bundled, loadScript, loadCss });
    expect(r.sdk).toBe(bundled);
    expect(r.choice).toMatchObject({ source: 'bundled', reason: 'not_assigned' });
    expect(loadScript).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('con debug loguea la elección', async () => {
    await resolveSurveySdk(undefined, { debug: true }, { bundled, loadScript: vi.fn(), loadCss });
    expect(logger.log).toHaveBeenCalledWith(`[Deepdots] survey SDK ${BUNDLED_SURVEY_SDK_VERSION} (bundled: not_assigned)`);
  });

  it('asignada en rango: la carga de jsDelivr con el nonce', async () => {
    const assigned = fake('2.2.38');
    const loadScript = vi.fn(async () => assigned);
    const r = await resolveSurveySdk('2.2.38', { nonce: 'n1', debug: true }, { bundled, loadScript, loadCss });
    expect(r.sdk).toBe(assigned);
    expect(r.choice).toEqual({ version: '2.2.38', source: 'assigned', requested: '2.2.38' });
    expect(r.css).toBe('/* css 2.2.38 */ .deepdots-popup{}');
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(surveySdkUrls('2.2.38')[0], 'n1');
    expect(logger.log).toHaveBeenCalledWith('[Deepdots] survey SDK 2.2.38 (assigned)');
  });

  it('jsDelivr falla → unpkg', async () => {
    const assigned = fake('2.2.38');
    const loadScript = vi.fn()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(assigned);
    const r = await resolveSurveySdk('2.2.38', {}, { bundled, loadScript, loadCss });
    expect(r.sdk).toBe(assigned);
    expect(loadScript.mock.calls.map((c) => c[0])).toEqual(surveySdkUrls('2.2.38'));
  });

  it('las dos fallan (CSP, sin red) → empaquetada, con aviso aunque no haya debug', async () => {
    const loadScript = vi.fn(async () => { throw new Error('blocked by CSP'); });
    const r = await resolveSurveySdk('2.2.38', {}, { bundled, loadScript, loadCss });
    expect(r.sdk).toBe(bundled);
    expect(r.choice).toEqual({ version: BUNDLED_SURVEY_SDK_VERSION, source: 'bundled', reason: 'load_failed', requested: '2.2.38' });
    expect(logger.warn).toHaveBeenCalledWith(`[Deepdots] survey SDK ${BUNDLED_SURVEY_SDK_VERSION} (bundled: load_failed, requested 2.2.38)`);
  });

  it('no soportada → empaquetada sin descargar y sin aviso (normal en versiones antiguas)', async () => {
    const loadScript = vi.fn();
    const r = await resolveSurveySdk('2.2.36', {}, { bundled, loadScript, loadCss });
    expect(r.choice).toMatchObject({ source: 'bundled', reason: 'unsupported', requested: '2.2.36' });
    expect(loadScript).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    await resolveSurveySdk('2.2.36', { debug: true }, { bundled, loadScript, loadCss });
    expect(logger.log).toHaveBeenCalledWith(`[Deepdots] survey SDK ${BUNDLED_SURVEY_SDK_VERSION} (bundled: unsupported, requested 2.2.36)`);
  });

  it('versión inválida → aviso aunque no haya debug', async () => {
    await resolveSurveySdk('latest', {}, { bundled, loadScript: vi.fn(), loadCss });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('la hoja no carga → JS y CSS empaquetados, sin descargar la JS asignada', async () => {
    const loadScript = vi.fn();
    const r = await resolveSurveySdk('2.2.38', {}, { bundled, loadScript, loadCss: vi.fn(async () => { throw new Error('chunk 404'); }) });
    expect(r.sdk).toBe(bundled);
    expect(r.css).toBeUndefined();
    expect(r.choice).toMatchObject({ source: 'bundled', reason: 'load_failed' });
    expect(loadScript).not.toHaveBeenCalled();
  });

  it('la JS no carga → tampoco se devuelve la hoja asignada', async () => {
    const r = await resolveSurveySdk('2.2.38', {}, { bundled, loadScript: vi.fn(async () => { throw new Error('x'); }), loadCss });
    expect(r.sdk).toBe(bundled);
    expect(r.css).toBeUndefined();
  });

  it('una sola descarga por versión; un fallo no se cachea', async () => {
    const assigned = fake('2.2.38');
    const loadScript = vi.fn(async () => assigned);
    await resolveSurveySdk('2.2.38', {}, { bundled, loadScript, loadCss });
    await resolveSurveySdk('2.2.38', {}, { bundled, loadScript, loadCss });
    expect(loadScript).toHaveBeenCalledTimes(1);

    resetSurveySdkCache();
    const failing = vi.fn(async () => { throw new Error('down'); });
    await resolveSurveySdk('2.2.38', {}, { bundled, loadScript: failing, loadCss });
    await resolveSurveySdk('2.2.38', {}, { bundled, loadScript: failing, loadCss });
    expect(failing).toHaveBeenCalledTimes(4); // 2 URLs × 2 aperturas
  });

  it('sin deps: usa el @magicfeedback/native empaquetado', async () => {
    const r = await resolveSurveySdk(undefined);
    expect((r.sdk as { __bundled?: boolean }).__bundled).toBe(true);
  });
});

describe('loadUmdScript', () => {
  const w = window as unknown as Record<string, unknown>;
  let appended: HTMLScriptElement[];

  beforeEach(() => {
    appended = [];
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      appended.push(node as unknown as HTMLScriptElement);
      return node;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete w.magicfeedback;
    delete w.define;
  });

  /** Simula que el UMD se ejecuta: deja su global y dispara onload. */
  const execute = (sdk: unknown) => {
    w.magicfeedback = sdk;
    appended[0].onload?.(new Event('load'));
  };

  it('devuelve el global que deja el UMD y restaura el del host', async () => {
    const hostOwn = { mine: true };
    w.magicfeedback = hostOwn;
    const p = loadUmdScript('https://cdn/x.js', 'n1');
    expect(appended[0].src).toBe('https://cdn/x.js');
    expect(appended[0].getAttribute('nonce')).toBe('n1');
    const sdk = fake('cdn');
    execute(sdk);
    await expect(p).resolves.toBe(sdk);
    expect(w.magicfeedback).toBe(hostOwn);
  });

  it('sin global previo no deja ninguno', async () => {
    const p = loadUmdScript('https://cdn/x.js');
    execute(fake('cdn'));
    await p;
    expect('magicfeedback' in w).toBe(false);
  });

  it('oculta define.amd mientras carga y lo devuelve', async () => {
    const define = Object.assign(() => {}, { amd: {} });
    w.define = define;
    const p = loadUmdScript('https://cdn/x.js');
    expect(w.define).toBeUndefined();
    execute(fake('cdn'));
    await p;
    expect(w.define).toBe(define);
  });

  it('error de red o script sin global usable → rechaza', async () => {
    const p1 = loadUmdScript('https://cdn/x.js');
    appended[0].onerror?.(new Event('error'));
    await expect(p1).rejects.toThrow('script failed to load');

    appended = [];
    const p2 = loadUmdScript('https://cdn/y.js');
    execute({ nope: true });
    await expect(p2).rejects.toThrow('did not expose');
  });

  it('timeout', async () => {
    vi.useFakeTimers();
    const p = loadUmdScript('https://cdn/x.js', undefined, 100);
    vi.advanceTimersByTime(101);
    await expect(p).rejects.toThrow('timeout');
    vi.useRealTimers();
  });
});
