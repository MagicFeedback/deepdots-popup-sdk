import { SDK_VERSION } from '../version';

/**
 * Qué versión de `@magicfeedback/native` (el "survey SDK") pinta cada survey dentro de un popup
 * (DD-70). Módulo puro, sin DOM ni import del paquete: lo usan las dos rutas, el popup DOM web
 * (`surveySdkLoader.ts`) y el WebView de React Native (`surveyHtml.ts`).
 *
 * La API devuelve en cada popup `surveyFrontend.sdkVersion`: el survey SDK con el que se
 * construyó la versión de MagicSurvey asignada al survey en el Admin (latest o fijada). Si está
 * en {@link SUPPORTED_SURVEY_SDK_VERSIONS} se usa esa (JS y CSS), como hace la página del survey; si no
 * viene, no es SemVer o no está en la lista, se quedan la JS y el CSS que van dentro de este SDK.
 */

/**
 * Versión de `@magicfeedback/native` que va dentro de este SDK (dep npm del bundle web y la que
 * carga el WebView de RN si la API no asigna otra). Un test la compara con la instalada: al subir
 * la dep hay que subirla aquí (y regenerar `src/assets/style.css`).
 */
export const BUNDLED_SURVEY_SDK_VERSION = '2.2.39';

/**
 * Versiones de survey SDK que este popup SDK sabe pintar: las que tienen su CSS vendorizado en
 * `src/assets/survey-css/<v>.css` (un test lo comprueba). El CSS del survey también sigue a la
 * versión asignada, y la hoja del paquete no se puede inyectar tal cual (repintaría la web del
 * host; ver `scripts/vendor-survey-css.mjs`), así que una versión sin hoja vendorizada no se
 * acepta. Todas de la misma minor que la empaquetada, y solo las que usa alguna versión de MagicSurvey del
 * registro (2.2.37 no la usa ninguna): cada una se prueba en el gate de release
 * (`apps/test-app/e2e/survey-sdk.spec.ts`, dentro de "Smoke + regression · SDK local").
 * Añadir una: vendorizar su hoja y sumarla aquí y a `src/ui/surveyCss.ts`.
 */
export const SUPPORTED_SURVEY_SDK_VERSIONS = ['2.2.37', '2.2.38', '2.2.39'] as const;

/** Por qué se usa la versión que va dentro en vez de la asignada. */
export type BundledReason =
  | 'not_assigned'
  | 'invalid'
  | 'unsupported'
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
  return (SUPPORTED_SURVEY_SDK_VERSIONS as readonly string[]).includes(version);
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
  if (!isSupportedSurveySdk(requested)) return bundled('unsupported');
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

/**
 * Hoja vendorizada de una versión, publicada con este SDK en npm (`dist/assets/assets/survey-css`).
 * La usa el WebView de React Native, que no puede importar chunks; el popup DOM la lleva dentro
 * (`surveyCss.ts`).
 */
export function surveySdkCssUrls(version: string): string[] {
  return [
    `https://cdn.jsdelivr.net/npm/@magicfeedback/popup-sdk@${SDK_VERSION}/dist/assets/assets/survey-css/${version}.css`,
    `https://unpkg.com/@magicfeedback/popup-sdk@${SDK_VERSION}/dist/assets/assets/survey-css/${version}.css`,
  ];
}

/** Texto de log común a las dos rutas, p. ej. `survey SDK 2.2.37 (assigned)`. */
export function describeSurveySdkChoice(choice: SurveySdkChoice): string {
  if (choice.source === 'assigned') return `survey SDK ${choice.version} (assigned)`;
  const asked = choice.requested ? `, requested ${choice.requested}` : '';
  return `survey SDK ${choice.version} (bundled: ${choice.reason}${asked})`;
}
