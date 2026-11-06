#!/usr/bin/env node
/**
 * DD-70 · "Survey SDK supported" line of the release notes, from the code and the survey version
 * registry, so it never goes stale by hand.
 *
 *   node scripts/release/survey-compat.mjs        prints the line for the current code
 *
 * `check.mjs release` calls checkSurveyCompat(): the release section of the CHANGELOG must
 * contain the line computed here, or the release is blocked with the expected line.
 *
 * Inputs:
 *   - SUPPORTED_SURVEY_SDK_VERSIONS and BUNDLED_SURVEY_SDK_VERSION (src/ui/surveySdkVersion.ts);
 *   - the public registry view GET /sdk/survey-versions of the API (no token): which survey
 *     frontend versions exist, their status and the survey SDK each is built with.
 *     SURVEY_VERSIONS_URL overrides it (default: production). SURVEY_COMPAT_OFFLINE=1 turns an
 *     unreachable registry into a warning (emergencies only: the line is then not checked).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SURVEY_VERSIONS_URL = 'https://api.deepdots.com/sdk/survey-versions';
export const LINE_PREFIX = 'Survey SDK supported:';
/** Statuses a survey can be on (latest or pinned) and that popups would then follow. */
const FOLLOWED_STATUSES = new Set(['stable', 'candidate']);

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
const range = (list) => (list.length === 0 ? 'none' : list.length === 1 ? list[0] : `${list[0]}–${list[list.length - 1]}`);

/** The supported list and the bundled version, read from the source of the SDK. */
export function codeFacts(source) {
  const list = /SUPPORTED_SURVEY_SDK_VERSIONS = \[([^\]]*)\]/.exec(source)?.[1];
  const bundled = /BUNDLED_SURVEY_SDK_VERSION = '([^']+)'/.exec(source)?.[1] ?? null;
  return { supported: list ? [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]) : null, bundled };
}

/** The line for the release notes, and the survey frontend versions popups follow. */
export function compatLine({ supported, bundled, registry }) {
  const sdks = [...supported].sort(cmp);
  const frontends = (registry?.items ?? [])
    .filter((v) => FOLLOWED_STATUSES.has(v.status) && v.sdkVersion && supported.includes(v.sdkVersion))
    .map((v) => v.version)
    .sort(cmp);
  return {
    line: `${LINE_PREFIX} ${range(sdks)} (survey frontend ${range(frontends)}); bundled: ${bundled}.`,
    frontends,
  };
}

/** Errors for a release section that lacks the expected line (the text after it is free). */
export function compatLineErrors(entryBody, expected) {
  const lines = (entryBody ?? '').split('\n').map((l) => l.trim());
  const found = lines.find((l) => l.startsWith(LINE_PREFIX));
  if (!found) return [`Falta la linea de compatibilidad en las release notes (DD-70). Anade al principio de la seccion: "${expected}"`];
  if (!found.startsWith(expected)) return [`La linea de compatibilidad no coincide con el codigo y el registro (DD-70). Es "${found}", deberia empezar por "${expected}".`];
  return [];
}

export async function fetchRegistry(url = process.env.SURVEY_VERSIONS_URL || DEFAULT_SURVEY_VERSIONS_URL, fetchImpl = fetch) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = await res.json();
  if (!Array.isArray(body?.items)) throw new Error(`unexpected body from ${url}`);
  return body;
}

/**
 * For `check.mjs release`: { errors, warnings, line }. Never throws.
 * `source` is src/ui/surveySdkVersion.ts; `entryBody` the CHANGELOG section of the version.
 */
export async function checkSurveyCompat({ source, entryBody, fetchImpl = fetch, env = process.env }) {
  const { supported, bundled } = codeFacts(source);
  if (!supported || !bundled) return { errors: ['No encuentro SUPPORTED_SURVEY_SDK_VERSIONS / BUNDLED_SURVEY_SDK_VERSION en src/ui/surveySdkVersion.ts.'], warnings: [], line: null };
  const url = env.SURVEY_VERSIONS_URL || DEFAULT_SURVEY_VERSIONS_URL;
  let registry;
  try {
    registry = await fetchRegistry(url, fetchImpl);
  } catch (e) {
    const msg = `No se pudo leer el registro de versiones (${url}): ${e.message}.`;
    if (env.SURVEY_COMPAT_OFFLINE === '1') return { errors: [], warnings: [`${msg} SURVEY_COMPAT_OFFLINE=1: linea de compatibilidad sin comprobar.`], line: null };
    return { errors: [`${msg} Sin eso no se comprueba la linea de compatibilidad; en una emergencia, SURVEY_COMPAT_OFFLINE=1.`], warnings: [], line: null };
  }
  const { line } = compatLine({ supported, bundled, registry });
  return { errors: compatLineErrors(entryBody, line), warnings: [], line };
}

// CLI: print the line for the current code and registry.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { supported, bundled } = codeFacts(readFileSync('src/ui/surveySdkVersion.ts', 'utf8'));
  const registry = await fetchRegistry();
  console.log(compatLine({ supported, bundled, registry }).line);
}
