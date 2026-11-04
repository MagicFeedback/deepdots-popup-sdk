#!/usr/bin/env node
/**
 * Aprueba capturas como referencias de la regresión visual (DD-28). SOLO a mano: se niega a
 * correr en CI. El resultado (PNGs + `approvals.json`) se sube en una rama y llega a dev por una
 * PR que se revisa; hasta que esa PR se fusiona, el check sigue comparando con las de antes.
 *
 *   approve.mjs --suite <dir> --run <run id> --reason "…" [--artifact <name>] [--only k1,k2] [--remove k]
 *   approve.mjs --suite <dir> --from <carpeta candidates> --reason "…" [--only …]
 *
 *   --run       baja el artefacto del run de CI con `gh run download` (por defecto el artefacto
 *               cuyo nombre empieza por `visual-report`); usa su carpeta `candidates/`
 *   --from      candidatas locales (`<device>/<state>.png` + `meta.json`), p. ej. de una
 *               ejecución en Docker en local
 *   --only      solo esas claves (`<device>/<state>`, con o sin .png); por defecto, todas las
 *               candidatas nuevas o distintas de su referencia actual (byte a byte)
 *   --remove    quita referencias (estados que ya no existen); también queda registrado
 *   --by        quién aprueba (por defecto, el usuario de `gh`)
 *
 * Cada aprobación añade una entrada a `approvals.approvals` (nunca se borran) y actualiza
 * `approvals.baselines[key] = {sha256, approvalId}`; check.mjs falla si un PNG de referencia no
 * coincide con su sha256 aprobado.
 *
 * ⚠️ Mismo fichero en deepdots-popup-sdk y en deepdots-popup-mobile-native-sdk.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listShots, sha256 } from './check.mjs';

const norm = (k) => (k.endsWith('.png') ? k : `${k}.png`);

/**
 * Calcula la aprobación. Pura: recibe los buffers y devuelve el nuevo `approvals.json` y qué
 * ficheros copiar/borrar.
 */
export function planApproval({ approvals, baselines, candidates, only = null, remove = [], by, reason, source, now = new Date() }) {
  if (!reason?.trim()) throw new Error('--reason is required: say why the new appearance is correct');
  if (!by?.trim()) throw new Error('--by is required (who approves)');
  const wanted = only?.map(norm) ?? null;
  if (wanted) for (const k of wanted) if (!candidates.has(k)) throw new Error(`--only ${k}: not in the candidates`);
  const toRemove = remove.map(norm);
  for (const k of toRemove) if (!baselines.has(k)) throw new Error(`--remove ${k}: there is no such baseline`);

  const files = [];
  for (const [key, buf] of candidates) {
    if (wanted && !wanted.includes(key)) continue;
    const prev = baselines.get(key);
    if (!wanted && prev && prev.equals(buf)) continue;
    files.push({ key, sha256: sha256(buf), previousSha256: prev ? sha256(prev) : null });
  }
  for (const key of toRemove) files.push({ key, sha256: null, previousSha256: sha256(baselines.get(key)) });
  if (!files.length) return null;

  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const id = `${stamp}-${source?.runId ?? 'local'}`;
  const next = { baselines: { ...(approvals?.baselines ?? {}) }, approvals: [...(approvals?.approvals ?? [])] };
  for (const f of files) {
    if (f.sha256) next.baselines[f.key] = { sha256: f.sha256, approvalId: id };
    else delete next.baselines[f.key];
  }
  next.baselines = Object.fromEntries(Object.entries(next.baselines).sort(([a], [b]) => a.localeCompare(b)));
  next.approvals.push({ id, approvedAt: now.toISOString(), approvedBy: by, reason, source: source ?? null, files });
  return { id, approvals: next, copy: files.filter((f) => f.sha256).map((f) => f.key), remove: toRemove };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

function ghUser() {
  try {
    return execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function findCandidates(dir) {
  if (existsSync(join(dir, 'candidates'))) return join(dir, 'candidates');
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) {
      const found = findCandidates(join(dir, d.name));
      if (found) return found;
    }
  }
  return null;
}

function main() {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('approve.mjs does not run in CI: baselines are only ever approved by a person.');
    process.exit(2);
  }
  const suite = arg('suite');
  const run = arg('run');
  let from = arg('from');
  if (!suite || (!run && !from)) {
    console.error('Uso: approve.mjs --suite <dir> (--run <id> | --from <dir>) --reason "…" [--only a,b] [--remove a] [--by who]');
    process.exit(2);
  }

  let tmp = null;
  let runUrl = null;
  if (run) {
    tmp = mkdtempSync(join(tmpdir(), 'visual-approve-'));
    const repo = arg('repo') ?? process.env.GITHUB_REPOSITORY ?? null;
    const name = arg('artifact');
    const args = ['run', 'download', run, '-D', tmp, ...(name ? ['-n', name] : ['-p', 'visual-report*']), ...(repo ? ['-R', repo] : [])];
    execFileSync('gh', args, { stdio: 'inherit' });
    from = findCandidates(tmp);
    if (!from) throw new Error(`run ${run}: no candidates/ folder in the downloaded artifacts`);
    runUrl = JSON.parse(execFileSync('gh', ['run', 'view', run, '--json', 'url', ...(repo ? ['-R', repo] : [])], { encoding: 'utf8' })).url;
  }

  const approvalsPath = join(suite, 'approvals.json');
  const approvals = existsSync(approvalsPath) ? JSON.parse(readFileSync(approvalsPath, 'utf8')) : { baselines: {}, approvals: [] };
  const baselinesDir = join(suite, 'baselines');
  const read = (dir) => new Map(listShots(dir).map((k) => [k, readFileSync(join(dir, k))]));
  const metaPath = join(from, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};

  const plan = planApproval({
    approvals,
    baselines: read(baselinesDir),
    candidates: read(from),
    only: arg('only')?.split(',').filter(Boolean) ?? null,
    remove: arg('remove')?.split(',').filter(Boolean) ?? [],
    by: arg('by') ?? ghUser(),
    reason: arg('reason'),
    source: { runId: run ?? null, runUrl, sdk: meta.sdk ?? null, sdkVersion: meta.sdkVersion ?? null, platform: meta.platform ?? null, devices: meta.devices ?? null },
  });
  if (!plan) {
    console.log('[visual] nothing to approve: every candidate is identical to its baseline');
    return;
  }
  for (const key of plan.copy) {
    mkdirSync(dirname(join(baselinesDir, key)), { recursive: true });
    copyFileSync(join(from, key), join(baselinesDir, key));
  }
  for (const key of plan.remove) rmSync(join(baselinesDir, key));
  writeFileSync(approvalsPath, JSON.stringify(plan.approvals, null, 2) + '\n');
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  console.log(`[visual] approval ${plan.id}: ${plan.copy.length} baseline(s) written, ${plan.remove.length} removed`);
  for (const key of plan.copy) console.log(`  + ${key}`);
  for (const key of plan.remove) console.log(`  - ${key}`);
  console.log('Next: commit baselines + approvals.json on a branch and open a PR (the reviewer sees the image diffs).');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
