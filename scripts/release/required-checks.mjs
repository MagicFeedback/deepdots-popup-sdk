#!/usr/bin/env node
/**
 * Checks del commit etiquetado que tienen que estar en verde antes de publicar (DD-25). El tag va
 * sobre el merge de la PR de release en dev, y ese push corre ci.yml y test-app.yml:
 *   - "Tests & build" y "E2E (Playwright)" (ci.yml);
 *   - "Smoke + regression · SDK local" (test-app.yml): la tienda de prueba con la build de ese
 *     commit, escritorio + móvil. Un test roto del test app bloquea la release.
 *   - "Visual regression · SDK local" (visual.yml, DD-28): capturas iguales a las baselines
 *     aprobadas; un cambio visual sin aprobar bloquea la release (DD-27).
 *
 *   required-checks.mjs --sha <commit etiquetado>
 *
 * Sale con 1 si alguno no terminó en verde (o no existe: sin evidencia no se publica). Lo usan
 * release.yml (antes de publicar) y scripts/release.mjs tag.
 *
 * DD-27: los checks en rojo solo se saltan con la excepción de emergencia de la PR de release
 * (override.mjs, docs/VERSIONING.md), que queda escrita en las release notes.
 *
 *   required-checks.mjs --sha <commit etiquetado> [--notes <release notes>]
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { releasePullFrom } from './metadata.mjs';
import { evaluateOverride, labelledBy, overrideNotes } from './override.mjs';

export const REQUIRED_CHECKS = ['Tests & build', 'E2E (Playwright)', 'Smoke + regression · SDK local', 'Visual regression · SDK local'];

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

/**
 * Evalúa el gate para el commit etiquetado. `api(path)` = GET a la API de GitHub (JSON).
 * Devuelve {ok, lines, errors, override}: `lines` para el log, `errors` lo que bloquea.
 */
export function evaluateRelease({ repo, sha, api }) {
  const short = sha.slice(0, 7);
  const results = requiredChecksFrom(api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs);
  const lines = results.map((r) => `${short} · ${r.name}: ${r.conclusion}`);
  const failing = failingChecks(results);
  if (!failing.length) return { ok: true, lines, errors: [] };
  const errors = failing.map((e) => `Check de ${short} no en verde: ${e}`);
  // La excepción solo existe en la PR de release que metió este commit.
  const pr = releasePullFrom(api(`repos/${repo}/commits/${sha}/pulls`) ?? [], sha);
  if (!pr) return { ok: false, lines, errors };
  const full = api(`repos/${repo}/pulls/${pr.number}`);
  const events = api(`repos/${repo}/issues/${pr.number}/events?per_page=100`) ?? [];
  const labeller = labelledBy(events, full.labels ?? [])?.login;
  const permission = labeller ? (api(`repos/${repo}/collaborators/${labeller}/permission`)?.permission ?? null) : null;
  const override = evaluateOverride({ pr: full, events, permission });
  if (override.granted) return { ok: true, lines, errors, override: { ...override, pr: pr.number, failing } };
  return { ok: false, lines, errors: [...errors, ...override.problems.map((p) => `Excepción de emergencia no válida: ${p}`)] };
}

function main() {
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : null;
  };
  const sha = arg('--sha');
  if (!sha) {
    console.error('Uso: required-checks.mjs --sha <commit> [--notes <release notes>]');
    process.exit(2);
  }
  const repo = process.env.GITHUB_REPOSITORY ?? 'MagicFeedback/deepdots-popup-sdk';
  const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
  const { ok, lines, errors, override } = evaluateRelease({ repo, sha, api });
  for (const l of lines) console.log(`[release] ${l}`);
  if (override) {
    for (const e of errors) console.log(`::warning::${e}`);
    console.log(`::warning::Excepción de emergencia aprobada por ${override.by} en la PR #${override.pr}: ${override.reason}`);
    const notes = arg('--notes');
    if (notes) appendFileSync(notes, overrideNotes(override));
  } else {
    for (const e of errors) console.log(`::error::${e}`);
  }
  if (!ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
