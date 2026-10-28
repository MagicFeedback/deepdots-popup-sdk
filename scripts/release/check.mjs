#!/usr/bin/env node
/**
 * Gate de release de @magicfeedback/popup-sdk (MF-3241). Ver docs/VERSIONING.md.
 *
 *   check.mjs pr [--base origin/dev]
 *     PRs a dev/main ("Version & changelog"): un cambio del paquete trae release notes en
 *     [Unreleased] (hacia dev) o sube la version (PR de release, o hotfix hacia main); y el
 *     manifiesto de compatibilidad es valido. En local: npm run release:check
 *
 *   check.mjs release --tag vX.Y.Z [--notes-out file] [--new-tag]
 *     Antes de `npm publish` en release.yml (y en el dry-run de las PRs de release): tag =
 *     version, bump respecto a lo publicado, CHANGELOG con notas y manifiesto valido.
 *     --new-tag (dry-run): ademas, el tag no puede existir todavia.
 *
 *   check.mjs schema [--write]
 *     Regenera release/config.schema.json desde src/types (npm run release:schema).
 *
 * Sale con 1 y los motivos si una regla falla. En GitHub Actions escribe ::error, el resumen
 * del job y outputs (kind, version, dist_tag).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { checkPullRequest, checkRelease, checkReleaseEntry, packageChanges } from './rules.mjs';
import { generateConfigSchema, validateManifest } from './manifest.mjs';

const argv = process.argv.slice(2);
const mode = argv[0];
const option = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

const json = (text) => (text == null ? null : JSON.parse(text));
const readOrNull = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** package.json, lock y CHANGELOG en un ref, o en el working tree si ref es null. */
function snapshot(ref) {
  const read = (path) => (ref ? tryGit('show', `${ref}:${path}`) : readOrNull(path));
  return { pkg: json(read('package.json')), lock: json(read('package-lock.json')), changelog: read('CHANGELOG.md') };
}

function changedFiles(from, to) {
  const diff = to ? git('diff', '--name-only', from, to) : git('diff', '--name-only', from);
  const untracked = to ? '' : git('ls-files', '--others', '--exclude-standard');
  return [...diff.split('\n'), ...untracked.split('\n')].filter(Boolean);
}

const inActions = Boolean(process.env.GITHUB_ACTIONS);

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

function report({ title, facts, reasons = [], errors }) {
  const passed = errors.length === 0;
  console.log(`\n${title}`);
  for (const [k, v] of Object.entries(facts)) console.log(`   ${k.padEnd(10)} ${v}`);
  if (reasons.length) console.log(`   cambios del paquete:\n${reasons.map((r) => `     - ${r}`).join('\n')}`);
  for (const error of errors) {
    console.error(inActions ? `::error title=Release gate (MF-3241)::${error}` : `\x1b[31mx\x1b[0m  ${error}`);
  }
  console.log(passed ? '\n\x1b[32mOK\x1b[0m' : '\nBloqueado. Ver docs/VERSIONING.md.');
  summary([
    `### ${passed ? '✅' : '❌'} ${title}`,
    '',
    ...Object.entries(facts).map(([k, v]) => `- **${k}**: ${v}`),
    ...(reasons.length ? ['', '<details><summary>Cambios del paquete</summary>', '', ...reasons.map((r) => `- \`${r}\``), '</details>'] : []),
    ...(errors.length ? ['', ...errors.map((e) => `- ❌ ${e}`)] : []),
    '',
  ]);
  if (!passed) process.exit(1);
}

function manifestErrors() {
  const { manifest, errors } = validateManifest();
  return { manifest, errors };
}

function pr() {
  const baseRef = option('base', 'origin/dev');
  const baseBranch = baseRef.replace(/^origin\//, '');
  const base = snapshot(baseRef);
  // En CI, HEAD es el merge de la PR sobre su base; en local, el working tree.
  const head = snapshot(inActions ? 'HEAD' : null);
  const files = inActions ? changedFiles(baseRef, 'HEAD') : changedFiles(baseRef);
  const version = head.pkg?.version;

  // Solo cuenta como "ya publicada" si el tag existe; y entonces el paquete tiene que ser el etiquetado.
  const tag = `v${version}`;
  const tagExists = tryGit('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) != null;
  let tagMatchesHead = false;
  if (tagExists) {
    const tagged = snapshot(`refs/tags/${tag}`);
    tagMatchesHead =
      packageChanges({
        changedFiles: inActions ? changedFiles(`refs/tags/${tag}`, 'HEAD') : changedFiles(`refs/tags/${tag}`),
        basePkg: tagged.pkg,
        headPkg: head.pkg,
        baseLock: tagged.lock,
        headLock: head.lock,
      }).length === 0;
  }

  const result = checkPullRequest({
    baseBranch,
    changedFiles: files,
    basePkg: base.pkg,
    headPkg: head.pkg,
    baseLock: base.lock,
    headLock: head.lock,
    baseChangelog: base.changelog,
    headChangelog: head.changelog,
    tagExists,
    tagMatchesHead,
  });
  const manifest = manifestErrors();
  output({ kind: result.kind, version });
  report({
    title: 'Version & changelog',
    facts: {
      base: `${baseBranch} (${base.pkg?.version})`,
      rama: version,
      tipo: { release: 'release (sube version)', change: 'cambio del paquete', none: 'no toca el paquete' }[result.kind],
      manifest: manifest.errors.length ? 'invalido' : 'valido',
    },
    reasons: result.reasons,
    errors: [...result.errors, ...manifest.errors],
  });
}

function release() {
  const tag = option('tag');
  if (!tag) {
    console.error('Uso: check.mjs release --tag vX.Y.Z [--notes-out file]');
    process.exit(2);
  }
  const head = snapshot(null);
  const previousTags = (tryGit('tag', '--list', 'v*') ?? '').split('\n').filter(Boolean).filter((t) => t !== tag);
  const { errors, distTag } = checkRelease({ tag, pkg: head.pkg, changelog: head.changelog, previousTags });
  // En el dry-run de la PR el tag aun no existe; si ya existe, esa version esta publicada.
  if (flag('new-tag') && tryGit('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) != null) {
    errors.unshift(`Sin bump: ${tag} ya existe, esa version ya esta publicada.`);
  }
  const manifest = manifestErrors();

  const notesOut = option('notes-out');
  if (notesOut) {
    const { entry } = checkReleaseEntry(head.changelog, head.pkg?.version);
    writeFileSync(notesOut, `${entry?.body ?? ''}\n`);
  }
  output({ version: head.pkg?.version, dist_tag: distTag ?? '' });
  report({
    title: `Release gate ${tag}`,
    facts: { tag, version: head.pkg?.version, 'dist-tag': distTag ?? '-', manifest: manifest.errors.length ? 'invalido' : 'valido' },
    errors: [...errors, ...manifest.errors],
  });
}

function schema() {
  const { manifest } = validateManifest({ checkGenerated: false });
  const path = manifest?.configSchema?.path ?? 'release/config.schema.json';
  const generated = generateConfigSchema();
  if (flag('write')) {
    writeFileSync(path, generated);
    console.log(`${path} regenerado desde src/types.`);
    return;
  }
  const same = readOrNull(path) === generated;
  console.log(same ? `${path} al dia.` : `${path} desactualizado: npm run release:schema`);
  process.exit(same ? 0 : 1);
}

if (mode === 'pr') pr();
else if (mode === 'release') release();
else if (mode === 'schema') schema();
else {
  console.error('Uso: check.mjs pr [--base origin/dev] | release --tag vX.Y.Z [--notes-out f] | schema [--write]');
  process.exit(2);
}
