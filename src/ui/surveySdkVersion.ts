/**
 * Qué versión de `@magicfeedback/native` (el "survey SDK") pinta cada survey dentro de un popup
 * (DD-70). Módulo puro, sin DOM ni import del paquete: lo usan las dos rutas, el popup DOM web
 * (`surveySdkLoader.ts`) y el WebView de React Native (`surveyHtml.ts`).
 *
 * La API devuelve en cada popup `surveyFrontend.sdkVersion`: el survey SDK con el que se
 * construyó la versión de MagicSurvey asignada al survey en el Admin (latest o fijada). Si está
 * dentro de {@link SUPPORTED_SURVEY_SDK_RANGE} se usa esa, como hace la página del survey; si no
 * viene, no es SemVer o cae fuera del rango, se queda la que va dentro de este SDK.
 */

/**
 * Versión de `@magicfeedback/native` que va dentro de este SDK (dep npm del bundle web y la que
 * carga el WebView de RN si la API no asigna otra). Un test la compara con la instalada: al subir
 * la dep hay que subirla aquí (y regenerar `src/assets/style.css`).
 */
export const BUNDLED_SURVEY_SDK_VERSION = '2.2.39';

/**
 * Rango de survey SDK que este popup SDK sabe pintar: `min` incluido, `below` excluido.
 *
 * - `min`: la más antigua con la que pasan las test apps de este SDK (eventos `onLoadedEvent` con
 *   `error`, códigos de error de submit, `onBackEvent`) — 2.2.37 es la que llevaba 1.18.0.
 * - `below`: la siguiente minor. El CSS del survey NO se descarga con la versión asignada: va
 *   vendorizado y acotado a `.deepdots-popup` (`src/assets/style.css`), así que solo se aceptan
 *   parches de la misma minor que el CSS. Una 2.3.0 no llega a este SDK hasta que se publique
 *   uno que la declare.
 */
export const SUPPORTED_SURVEY_SDK_RANGE = { min: '2.2.37', below: '2.3.0' } as const;

/** Por qué se usa la versión que va dentro en vez de la asignada. */
export type BundledReason =
  | 'not_assigned'
  | 'invalid'
  | 'out_of_range'
  | 'same_as_bundled'
  | 'load_failed';

export interface SurveySdkChoice {
  /** Versión que se va a cargar. */
  version: string;
  /** `assigned` = la que asignó la API; `bundled` = la de este SDK. */
  source: 'assigned' | 'bundled';
  /** Solo con `source: 'bundled'`. */
  reason?: BundledReason;
  /** La que pidió la API, si pidió alguna. */
  requested?: string;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isSemver(value: unknown): value is string {
  return typeof value === 'string' && SEMVER.test(value);
}

/** Negativo si `a` es anterior a `b`. Ambas SemVer. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function isSupportedSurveySdk(version: string): boolean {
  return isSemver(version)
    && compareSemver(version, SUPPORTED_SURVEY_SDK_RANGE.min) >= 0
    && compareSemver(version, SUPPORTED_SURVEY_SDK_RANGE.below) < 0;
}

/** Decide la versión a cargar a partir de `surveyFrontend.sdkVersion` de la API. */
export function chooseSurveySdkVersion(requested?: string | null): SurveySdkChoice {
  const bundled = (reason: BundledReason): SurveySdkChoice => ({
    version: BUNDLED_SURVEY_SDK_VERSION,
    source: 'bundled',
    reason,
    ...(requested ? { requested } : {}),
  });
  if (requested === undefined || requested === null || requested === '') return bundled('not_assigned');
  if (!isSemver(requested)) return bundled('invalid');
  if (!isSupportedSurveySdk(requested)) return bundled('out_of_range');
  if (requested === BUNDLED_SURVEY_SDK_VERSION) return bundled('same_as_bundled');
  return { version: requested, source: 'assigned', requested };
}

/** URLs del bundle de navegador de una versión, en orden de preferencia. */
export function surveySdkUrls(version: string): string[] {
  return [
    `https://cdn.jsdelivr.net/npm/@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`,
    `https://unpkg.com/@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`,
  ];
}

/** Texto de log común a las dos rutas, p. ej. `survey SDK 2.2.37 (assigned)`. */
export function describeSurveySdkChoice(choice: SurveySdkChoice): string {
  if (choice.source === 'assigned') return `survey SDK ${choice.version} (assigned)`;
  const asked = choice.requested ? `, requested ${choice.requested}` : '';
  return `survey SDK ${choice.version} (bundled: ${choice.reason}${asked})`;
}
