#!/usr/bin/env node
/**
 * Checks del commit etiquetado que tienen que estar en verde antes de publicar (DD-25). El tag va
 * sobre el merge de la PR de release en dev, y ese push corre ci.yml y test-app.yml:
 *   - "Tests & build" y "E2E (Playwright)" (ci.yml);
 *   - "Smoke + regression · SDK local" (test-app.yml): la tienda de prueba con la build de ese
 *     commit, escritorio + móvil. Un test roto del test app bloquea la release.
 *
 *   required-checks.mjs --sha <commit etiquetado>
 *
 * Sale con 1 si alguno no terminó en verde. Lo usan release.yml (antes de publicar) y
 * scripts/release.mjs tag.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CHECKS = ['Tests & build', 'E2E (Playwright)', 'Smoke + regression · SDK local'];

/** El check-run más reciente de cada check requerido, o `missing`. */
export function requiredChecksFrom(checkRuns = []) {
  return REQUIRED_CHECKS.map((name) => {
    const last = checkRuns
      .filter((c) => c.name === name)
      .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')))[0];
    return { name, conclusion: last ? (last.conclusion ?? last.status) : 'missing', url: last?.html_url ?? null };
  });
}

/** Mensajes de error de los checks que no están en verde. */
export function failingChecks(results) {
  return results.filter((r) => r.conclusion !== 'success').map((r) => `"${r.name}" ${r.conclusion}${r.url ? ` ${r.url}` : ''}`);
}

function main() {
  const at = process.argv.indexOf('--sha');
  const sha = at > 0 ? process.argv[at + 1] : null;
  if (!sha) {
    console.error('Uso: required-checks.mjs --sha <commit>');
    process.exit(2);
  }
  const repo = process.env.GITHUB_REPOSITORY ?? 'MagicFeedback/deepdots-popup-sdk';
  const runs = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?per_page=100`], { encoding: 'utf8' })).check_runs;
  const results = requiredChecksFrom(runs);
  for (const r of results) console.log(`[release] ${sha.slice(0, 7)} · ${r.name}: ${r.conclusion}`);
  const errors = failingChecks(results);
  if (errors.length) {
    for (const e of errors) console.log(`::error::Check de ${sha.slice(0, 7)} no en verde: ${e}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
