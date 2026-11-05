import bundledSurveySdk from '@magicfeedback/native';
import {
  BUNDLED_SURVEY_SDK_VERSION,
  chooseSurveySdkVersion,
  describeSurveySdkChoice,
  surveySdkUrls,
  type SurveySdkChoice,
} from './surveySdkVersion';
import { sdkLog, sdkWarn } from '../util/logger';
import { SURVEY_CSS_LOADERS } from './surveyCss';

/**
 * Survey SDK del popup DOM web (DD-70): la versión de `@magicfeedback/native` asignada al survey
 * en el Admin si está en rango y carga, o la que va empaquetada en este SDK si no.
 *
 * La asignada se trae como `<script>` del bundle de navegador (UMD) desde jsDelivr y, si falla,
 * desde unpkg. El UMD se publica en `self.magicfeedback`: se recoge al terminar de ejecutar y se
 * devuelve el global a como estaba, para no pisar un `magicfeedback` propio del host. Si el host
 * usa un loader AMD (`define.amd`), el UMD se registraría como módulo anónimo y no dejaría global;
 * mientras se carga se oculta `define` para que tome la rama del global.
 *
 * El CSS va con la JS: la hoja vendorizada de esa versión (`src/assets/survey-css/<v>.css`,
 * acotada a `.deepdots-popup`), que viaja dentro del SDK como chunk perezoso. Si la hoja o la JS
 * no cargan, se usan las dos empaquetadas: nunca JS de una versión con CSS de otra.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SurveySdk = any;

export interface LoadedSurveySdk {
  sdk: SurveySdk;
  choice: SurveySdkChoice;
  /** CSS vendorizado de la versión asignada; undefined = el empaquetado (`style.css`). */
  css?: string;
}

/** Tiempo máximo por URL antes de pasar a la siguiente. */
export const SURVEY_SDK_LOAD_TIMEOUT_MS = 6000;

interface LoaderDeps {
  /** Inyectable en tests. Resuelve con el SDK cargado o rechaza. */
  loadScript?: (url: string, nonce?: string) => Promise<SurveySdk>;
  bundled?: SurveySdk;
  /** Inyectable en tests. */
  loadCss?: (version: string) => Promise<string>;
}

async function loadVendoredCss(version: string): Promise<string> {
  const load = SURVEY_CSS_LOADERS[version];
  if (!load) throw new Error(`no vendored survey CSS for ${version}`);
  const css = (await load()).default;
  if (typeof css !== 'string' || css.length === 0) throw new Error(`empty survey CSS for ${version}`);
  return css;
}

const cache = new Map<string, Promise<{ sdk: SurveySdk; css: string } | null>>();
/** Cadena para no ejecutar dos UMD a la vez (los dos escriben el mismo global). */
let queue: Promise<unknown> = Promise.resolve();

function isUsable(sdk: SurveySdk): boolean {
  return !!sdk && typeof sdk.form === 'function' && typeof sdk.init === 'function';
}

/** Carga un UMD por `<script>` y devuelve lo que dejó en `self.magicfeedback`. */
export function loadUmdScript(url: string, nonce?: string, timeoutMs = SURVEY_SDK_LOAD_TIMEOUT_MS): Promise<SurveySdk> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const hadGlobal = Object.prototype.hasOwnProperty.call(w, 'magicfeedback');
    const previous = w.magicfeedback;
    const amdDefine = typeof w.define === 'function' && w.define.amd ? w.define : undefined;
    if (amdDefine) w.define = undefined;

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (nonce) script.setAttribute('nonce', nonce);

    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const loaded = w.magicfeedback;
      if (hadGlobal) w.magicfeedback = previous;
      else delete w.magicfeedback;
      if (amdDefine) w.define = amdDefine;
      script.remove();
      if (error) reject(error);
      else if (loaded === previous || !isUsable(loaded)) reject(new Error('survey SDK script did not expose magicfeedback'));
      else resolve(loaded);
    };
    const timer = setTimeout(() => finish(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('script failed to load'));
    document.head.appendChild(script);
  });
}

async function loadVersion(
  version: string,
  nonce: string | undefined,
  loadScript: NonNullable<LoaderDeps['loadScript']>,
  loadCss: NonNullable<LoaderDeps['loadCss']>,
): Promise<{ sdk: SurveySdk; css: string } | null> {
  // La hoja primero: sin ella no se usa la JS de esa versión.
  let css: string;
  try {
    css = await loadCss(version);
  } catch (error) {
    sdkWarn(`[Deepdots] survey CSS ${version} failed:`, error);
    return null;
  }
  const sdk = await loadScriptChain(version, nonce, loadScript);
  return sdk ? { sdk, css } : null;
}

async function loadScriptChain(version: string, nonce: string | undefined, loadScript: NonNullable<LoaderDeps['loadScript']>): Promise<SurveySdk | null> {
  for (const url of surveySdkUrls(version)) {
    const attempt = queue.then(() => loadScript(url, nonce));
    queue = attempt.catch(() => undefined);
    try {
      const sdk = await attempt;
      if (isUsable(sdk)) return sdk;
    } catch (error) {
      sdkWarn(`[Deepdots] survey SDK ${version} failed from ${url}:`, error);
    }
  }
  return null;
}

/**
 * Devuelve el survey SDK con el que pintar un survey a partir de `surveyFrontend.sdkVersion`.
 * Nunca rechaza: ante cualquier fallo devuelve el empaquetado con `reason: 'load_failed'`.
 */
export interface ResolveSurveySdkOptions {
  /** Nonce de la CSP del host, puesto en el `<script>`. */
  nonce?: string;
  /** `init({debug})`: la elección normal solo se loguea con debug. */
  debug?: boolean;
}

/**
 * Log de la elección: con `debug`, siempre; sin él, solo si la API pidió una versión que debía
 * poder usarse y no se ha podido (inválida, no cargó). Una versión no soportada NO avisa sin
 * debug: es lo normal para surveys en versiones antiguas (p. ej. prod latest 3.2.0 → 2.2.36) y
 * saldría en cada apertura en la consola del cliente.
 */
export function logSurveySdkChoice(choice: SurveySdkChoice, debug?: boolean): void {
  const problem = choice.source === 'bundled'
    && (choice.reason === 'invalid' || choice.reason === 'load_failed');
  if (problem) sdkWarn(`[Deepdots] ${describeSurveySdkChoice(choice)}`);
  else if (debug) sdkLog(`[Deepdots] ${describeSurveySdkChoice(choice)}`);
}

export async function resolveSurveySdk(
  requested: string | null | undefined,
  options: ResolveSurveySdkOptions = {},
  deps: LoaderDeps = {},
): Promise<LoadedSurveySdk> {
  const { nonce, debug } = options;
  const bundled = deps.bundled ?? bundledSurveySdk;
  const choice = chooseSurveySdkVersion(requested);
  if (choice.source === 'bundled' || typeof document === 'undefined') {
    logSurveySdkChoice(choice, debug);
    return { sdk: bundled, choice };
  }

  const loadScript = deps.loadScript ?? loadUmdScript;
  const loadCss = deps.loadCss ?? loadVendoredCss;
  let pending = cache.get(choice.version);
  if (!pending) {
    pending = loadVersion(choice.version, nonce, loadScript, loadCss);
    cache.set(choice.version, pending);
  }
  const loaded = await pending;
  if (loaded) {
    logSurveySdkChoice(choice, debug);
    return { sdk: loaded.sdk, css: loaded.css, choice };
  }
  // No se cachea el fallo: la siguiente apertura lo reintenta (CDN caído un momento).
  cache.delete(choice.version);
  const fallback: SurveySdkChoice = {
    version: BUNDLED_SURVEY_SDK_VERSION,
    source: 'bundled',
    reason: 'load_failed',
    requested: choice.version,
  };
  logSurveySdkChoice(fallback, debug);
  return { sdk: bundled, choice: fallback };
}

/** Solo tests. */
export function resetSurveySdkCache(): void {
  cache.clear();
  queue = Promise.resolve();
}
