#!/usr/bin/env node
// Release de @magicfeedback/popup-sdk en dos pasos, uno a cada lado de la PR:
//
//   npm run release:prepare -- <X.Y.Z|patch|minor|major> [--dry-run]
//     Desde origin/dev: rama release/X.Y.Z, version en package.json + package-lock.json,
//     la seccion [Unreleased] del CHANGELOG pasa a [X.Y.Z], commit, push y PR a dev.
//     Trabaja en un worktree temporal: tu checkout no se toca.
//
//   npm run release:tag [-- --yes] [--no-watch]
//     Cuando la PR esta fusionada: comprueba lo mismo que .github/workflows/release.yml
//     (version, CHANGELOG, que no exista el tag ni la version en npm, CI de dev en verde),
//     etiqueta vX.Y.Z sobre origin/dev, lo sube y sigue el workflow hasta ver la version en npm.
//
// Necesita `git` y `gh` autenticado. No publica nada por si mismo: publica el workflow.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const PKG = '@magicfeedback/popup-sdk';
const BASE = 'dev';
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

// ---------- utilidades ----------

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, out: run(cmd, args, opts) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() };
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function step(msg) {
  console.log(`→ ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Contenido de un fichero en un commit, tal cual (sin recortar: conserva el salto final). */
function showFile(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function npmHasVersion(version) {
  return tryRun('npm', ['view', `${PKG}@${version}`, 'version']).out === version;
}

function remoteTagExists(tag) {
  return tryRun('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`]).ok;
}

function remoteBranchExists(branch) {
  return tryRun('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch]).ok;
}

// ---------- CHANGELOG ----------

/** Cuerpo de la seccion [Unreleased] (sin la cabecera). */
export function unreleasedBody(changelog) {
  const m = changelog.match(/^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m);
  return (m && m[1].trim()) || null;
}

/** Inserta `## [X.Y.Z] — fecha` justo debajo de [Unreleased], que queda vacia. */
export function promoteUnreleased(changelog, version, date) {
  const head = /^## \[Unreleased\][^\n]*\n\n?/m;
  if (!head.test(changelog)) throw new Error('El CHANGELOG no tiene seccion ## [Unreleased].');
  return changelog.replace(head, (h) => `${h.trimEnd()}\n\n## [${version}] — ${date}\n\n`);
}

/** Cuerpo de la seccion ## [X.Y.Z], para las notas de la PR. */
export function versionBody(changelog, version) {
  const esc = version.replace(/\./g, '\\.');
  const m = changelog.match(new RegExp(`^## \\[${esc}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))`, 'm'));
  return (m && m[1].trim()) || null;
}

// ---------- versiones ----------

export function nextVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const [maj, min, pat] = current.split('-')[0].split('.').map(Number);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Version no valida: "${bump}". Usa X.Y.Z, patch, minor o major.`);
}

function isGreater(a, b) {
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  // Misma X.Y.Z: una version final va por delante de su prerelease.
  return !a.includes('-') && b.includes('-');
}

// ---------- prepare ----------

async function prepare(bump, { dryRun }) {
  if (!bump) fail('Falta la version: npm run release:prepare -- <X.Y.Z|patch|minor|major>');

  step(`git fetch origin`);
  run('git', ['fetch', '--quiet', '--prune', '--tags', 'origin']);

  const current = JSON.parse(showFile(`origin/${BASE}`, 'package.json')).version;
  const version = nextVersion(current, bump);
  const tag = `v${version}`;
  const branch = `release/${version}`;
  console.log(`  ${BASE} esta en ${current} → release ${version}`);

  if (!isGreater(version, current)) fail(`${version} no es mayor que la version de ${BASE} (${current}).`);
  if (remoteTagExists(tag)) fail(`El tag ${tag} ya existe en origin.`);
  if (npmHasVersion(version)) fail(`${PKG}@${version} ya esta en npm.`);
  if (remoteBranchExists(branch)) fail(`La rama ${branch} ya existe en origin (¿hay una PR de release abierta?).`);

  const changelog = showFile(`origin/${BASE}`, 'CHANGELOG.md');
  const notes = unreleasedBody(changelog);
  if (!notes) fail('La seccion [Unreleased] del CHANGELOG esta vacia: no hay nada que publicar.');

  const dir = mkdtempSync(join(tmpdir(), 'popup-sdk-release-'));
  step(`worktree temporal en ${dir}`);
  run('git', ['worktree', 'add', '--quiet', '-b', branch, dir, `origin/${BASE}`]);
  try {
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(dir, 'CHANGELOG.md'), promoteUnreleased(changelog, version, date));
    run('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts'], { cwd: dir });
    run('git', ['add', 'CHANGELOG.md', 'package.json', 'package-lock.json'], { cwd: dir });
    run('git', ['commit', '--quiet', '-m', `chore(release): ${version}`], { cwd: dir });
    console.log(`\n${run('git', ['show', '--stat', '--format=%h %s', 'HEAD'], { cwd: dir })}\n`);

    if (dryRun) {
      console.log(run('git', ['show', '--format=', 'HEAD', '--', 'CHANGELOG.md', 'package.json'], { cwd: dir }));
      console.log('\n(dry-run) No se sube la rama ni se abre la PR.');
      return;
    }

    step(`git push origin ${branch}`);
    run('git', ['push', '--quiet', '-u', 'origin', branch], { cwd: dir });
    const body = `Release ${version}.\n\nAl fusionar: \`npm run release:tag\`.\n\n${notes}`;
    const url = run('gh', ['pr', 'create', '--base', BASE, '--head', branch, '--title', `Release ${version}`, '--body', body], { cwd: dir });
    console.log(`\n✔ PR abierta: ${url}`);
    console.log(`  Cuando este fusionada: npm run release:tag`);
  } finally {
    tryRun('git', ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
    if (dryRun) tryRun('git', ['branch', '-D', branch]);
  }
}

// ---------- tag ----------

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [s/N] `);
  rl.close();
  return /^(s|si|sí|y|yes)$/i.test(answer.trim());
}

async function tagRelease({ yes, watch }) {
  step('git fetch origin');
  run('git', ['fetch', '--quiet', '--prune', '--tags', 'origin']);

  const sha = run('git', ['rev-parse', `origin/${BASE}`]);
  const subject = run('git', ['log', '-1', '--format=%s', sha]);
  const version = JSON.parse(showFile(sha, 'package.json')).version;
  const tag = `v${version}`;
  console.log(`  ${BASE} = ${sha.slice(0, 7)} "${subject}" · version ${version}`);

  if (!SEMVER.test(version)) fail(`package.json tiene una version no valida: ${version}`);
  if (remoteTagExists(tag)) fail(`El tag ${tag} ya existe en origin: esta version ya se etiqueto.`);
  if (tryRun('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]).ok)
    fail(`El tag ${tag} existe en local pero no en origin. Borralo con: git tag -d ${tag}`);
  if (npmHasVersion(version)) fail(`${PKG}@${version} ya esta en npm. ¿Falta subir la version con release:prepare?`);
  if (!versionBody(showFile(sha, 'CHANGELOG.md'), version))
    fail(`El CHANGELOG de ${BASE} no tiene la seccion ## [${version}] (o esta vacia).`);

  // Si hay una PR de release para esta version, tiene que estar fusionada.
  const pr = tryRun('gh', ['pr', 'list', '--head', `release/${version}`, '--state', 'all', '--json', 'number,state', '--jq', '.[0] // empty']);
  if (pr.ok && pr.out) {
    const { number, state } = JSON.parse(pr.out);
    if (state !== 'MERGED') fail(`La PR #${number} (release/${version}) esta ${state}: fusionala antes de etiquetar.`);
  }

  // El CI de dev tiene que haber pasado en ese commit.
  const ci = tryRun('gh', ['run', 'list', '--workflow', 'ci.yml', '--commit', sha, '--json', 'status,conclusion,url', '--jq', '.[0] // empty']);
  if (!ci.ok || !ci.out) fail(`No hay ejecucion de CI para ${sha.slice(0, 7)}. Espera a que arranque y vuelve a probar.`);
  const { status, conclusion, url } = JSON.parse(ci.out);
  if (status !== 'completed') fail(`El CI de ${sha.slice(0, 7)} aun esta en curso (${status}): ${url}`);
  if (conclusion !== 'success') fail(`El CI de ${sha.slice(0, 7)} ha terminado en ${conclusion}: ${url}`);
  console.log(`  CI de ${BASE} en verde`);

  if (!yes && !(await confirm(`\nEtiquetar ${tag} sobre ${sha.slice(0, 7)} y publicar?`))) fail('Cancelado.');

  run('git', ['tag', '-a', tag, sha, '-m', tag]);
  step(`git push origin ${tag}`);
  run('git', ['push', '--quiet', 'origin', tag]);
  console.log(`✔ ${tag} subido. El workflow de release se encarga del resto.`);
  if (!watch) return;

  // Esperar a que el workflow aparezca, seguirlo, y luego esperar a npm.
  let runId = '';
  for (let i = 0; i < 20 && !runId; i++) {
    await sleep(3000);
    runId = tryRun('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', tag, '--json', 'databaseId', '--jq', '.[0].databaseId // empty']).out;
  }
  if (!runId) fail(`No veo la ejecucion del workflow para ${tag}. Revisa: gh run list --workflow release.yml`);
  step(`siguiendo el workflow (gh run watch ${runId})`);
  const watched = tryRun('gh', ['run', 'watch', runId, '--exit-status', '--interval', '10']);
  if (!watched.ok) fail(`El workflow ha fallado:\n${tryRun('gh', ['run', 'view', runId, '--log-failed']).out.split('\n').slice(-20).join('\n')}`);

  step(`esperando a que npm muestre ${version} (tarda un par de minutos)`);
  for (let i = 0; i < 40; i++) {
    if (npmHasVersion(version)) {
      console.log(`\n✔ ${PKG}@${version} publicado.`);
      console.log(`  npm:     https://www.npmjs.com/package/${PKG}/v/${version}`);
      console.log(`  release: https://github.com/MagicFeedback/deepdots-popup-sdk/releases/tag/${tag}`);
      return;
    }
    await sleep(15000);
  }
  fail(`El workflow termino bien pero npm aun no muestra ${version} tras 10 min. Revisa npmjs.com.`);
}

// ---------- main ----------

// Solo como comando: importar el modulo (tests) no debe ejecutar nada.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [, , cmd, ...rest] = process.argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const positional = rest.filter((a) => !a.startsWith('--'));

  if (cmd === 'prepare') await prepare(positional[0], { dryRun: flags.has('--dry-run') });
  else if (cmd === 'tag') await tagRelease({ yes: flags.has('--yes'), watch: !flags.has('--no-watch') });
  else {
    console.log('Uso:\n  npm run release:prepare -- <X.Y.Z|patch|minor|major> [--dry-run]\n  npm run release:tag [-- --yes] [--no-watch]');
    process.exit(cmd ? 1 : 0);
  }
}
