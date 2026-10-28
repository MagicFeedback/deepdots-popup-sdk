#!/usr/bin/env node
/**
 * Escribe release.json: la metadata trazable de una release (MF-3241). Va adjunto a la
 * GitHub Release junto al tarball, y dice que artefacto exacto se probo y se publico, desde
 * que commit, con que CI en verde y quien lo aprobo.
 *
 *   metadata.mjs --tag vX.Y.Z --tgz paquete.tgz --pack pack.json [--publish publish.json]
 *                [--require-ci] [--dry-run] --out release.json
 *
 * `pack.json` es la salida de `npm pack --json`; `publish.json`, la de `npm publish --json`.
 * Con --publish comprueba que npm guardo exactamente el tarball probado (misma integrity).
 * Con --require-ci falla si el CI (ci.yml) de ese commit no termino en verde.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Ultima revision de cada revisor; aprobada si la ultima es APPROVED. */
export function approvalsFrom(reviews = []) {
  const last = new Map();
  for (const r of reviews) if (r.user?.login && r.state !== 'COMMENTED') last.set(r.user.login, r);
  return [...last.values()].filter((r) => r.state === 'APPROVED').map((r) => ({ by: r.user.login, at: r.submitted_at }));
}

/**
 * La PR que metio el commit en la rama de release: fusionada en dev (o main en un hotfix).
 * El commit etiquetado es el merge de la PR de release.
 */
export function releasePullFrom(pulls = [], sha) {
  return (
    pulls.find((p) => p.merged_at && p.merge_commit_sha === sha) ??
    pulls.find((p) => p.merged_at && ['dev', 'main'].includes(p.base?.ref)) ??
    null
  );
}

/** Errores de trazabilidad: lo publicado tiene que ser lo empaquetado y probado. */
export function verifyArtifact({ pack, publish, sha256, tgzSha512 }) {
  const errors = [];
  if (pack.integrity !== tgzSha512) errors.push(`El tarball no es el que dio npm pack (integrity ${tgzSha512} != ${pack.integrity}).`);
  if (publish) {
    if (publish.integrity !== pack.integrity) {
      errors.push(`npm guardo otro artefacto: integrity publicada ${publish.integrity}, probada ${pack.integrity}.`);
    }
    if (publish.version !== pack.version) errors.push(`npm publico ${publish.version} y se probo ${pack.version}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) errors.push('sha256 del tarball no valido.');
  return errors;
}

function gh(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    console.warn(`::warning::gh api ${path}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const option = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const flag = (name) => argv.includes(`--${name}`);
  const [tag, tgz, out] = [option('tag'), option('tgz'), option('out')];
  if (!tag || !tgz || !option('pack') || !out) {
    console.error('Uso: metadata.mjs --tag vX.Y.Z --tgz f.tgz --pack pack.json [--publish publish.json] [--require-ci] [--dry-run] --out release.json');
    process.exit(2);
  }

  // `npm pack --json` y `npm publish --json` devuelven un array (pack) o un objeto (publish).
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const pack = one(JSON.parse(readFileSync(option('pack'), 'utf8')));
  const publish = option('publish') ? one(JSON.parse(readFileSync(option('publish'), 'utf8'))) : null;
  const bytes = readFileSync(tgz);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const tgzSha512 = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const errors = verifyArtifact({ pack, publish, sha256, tgzSha512 });

  const repo = process.env.GITHUB_REPOSITORY ?? 'MagicFeedback/deepdots-popup-sdk';
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const sha = process.env.RELEASE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  // CI del commit: el que release:tag exige en verde antes de etiquetar.
  const runs = gh(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=5`)?.workflow_runs ?? [];
  const run = runs.find((r) => r.status === 'completed') ?? runs[0] ?? null;
  const ci = run ? { workflow: 'ci.yml', runId: run.id, url: run.html_url, conclusion: run.conclusion ?? run.status } : null;
  if (flag('require-ci') && ci?.conclusion !== 'success') {
    errors.push(`El CI (ci.yml) de ${sha.slice(0, 7)} no esta en verde: ${ci ? `${ci.conclusion} ${ci.url}` : 'sin ejecucion'}.`);
  }

  let approval = null;
  if (!flag('dry-run')) {
    const pr = releasePullFrom(gh(`repos/${repo}/commits/${sha}/pulls`) ?? [], sha);
    const full = pr ? gh(`repos/${repo}/pulls/${pr.number}`) : null;
    approval = {
      pullRequest: pr ? { number: pr.number, url: pr.html_url, title: pr.title, base: pr.base?.ref, mergedAt: pr.merged_at, mergedBy: full?.merged_by?.login ?? null } : null,
      approvals: pr ? approvalsFrom(gh(`repos/${repo}/pulls/${pr.number}/reviews`) ?? []) : [],
      taggedBy: process.env.GITHUB_ACTOR ?? null,
      ciPassed: ci?.conclusion === 'success',
    };
    if (!pr) console.warn(`::warning::No encuentro la PR fusionada de ${sha.slice(0, 7)}; la aprobacion queda solo con CI y tag.`);
  }

  const manifest = JSON.parse(readFileSync('release/compatibility.json', 'utf8'));
  const runUrl = process.env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  const metadata = {
    schemaVersion: 1,
    name: pack.name,
    version: pack.version,
    tag,
    platform: manifest.platform,
    dryRun: flag('dry-run'),
    commit: sha,
    commitUrl: `${server}/${repo}/commit/${sha}`,
    artifact: {
      file: pack.filename,
      size: bytes.length,
      sha256,
      integrity: pack.integrity,
      shasum: pack.shasum,
      fileCount: pack.files?.length ?? null,
      npm: publish ? { published: true, integrity: publish.integrity, url: `https://www.npmjs.com/package/${pack.name}/v/${pack.version}` } : { published: false },
    },
    smokeTest: 'scripts/release/smoke.mjs (ESM + CJS + layout) sobre este mismo fichero',
    ci,
    approval,
    workflowRun: runUrl,
    compatibility: manifest,
  };
  writeFileSync(out, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`${out}: ${pack.name}@${pack.version} sha256 ${sha256}`);

  if (errors.length) {
    for (const e of errors) console.error(process.env.GITHUB_ACTIONS ? `::error title=Release metadata::${e}` : `x  ${e}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
