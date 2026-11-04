#!/usr/bin/env node
/**
 * Regresión visual (DD-28): compara las capturas de una ejecución con las referencias APROBADAS.
 *
 *   check.mjs --suite <dir> --actual <dir> --out <dir> [--devices a,b]
 *
 *   --suite    carpeta con `visual.json` (tolerancias y máscaras), `baselines/<device>/<state>.png`
 *              y `approvals.json` (registro de aprobaciones con el sha256 de cada referencia)
 *   --actual   capturas de esta ejecución: `<device>/<state>.png` + `meta.json` (versión del SDK,
 *              plataforma, dispositivo/SO de cada device)
 *   --out      evidencia: `report.html`, `results.json`, `summary.md`, `candidates/` (copia de las
 *              capturas, lo que se aprobaría con approve.mjs), `expected/` y `diff/`
 *   --devices  solo estos devices (por defecto: los que haya en --actual)
 *   --captured-only  solo los estados con captura en esta ejecución (una suite parcial, p. ej. la
 *              corta de una PR que solo corre los flujos que cambia): una referencia sin captura
 *              no cuenta. Sin capturas sigue siendo rojo. Nunca en el check de release.
 *
 * Verde = cada referencia aprobada del device tiene captura y coincide dentro de la tolerancia.
 * Rojo  = cualquier diferencia, una captura sin referencia, una referencia sin captura, o una
 *         referencia que no coincide con su sha256 aprobado (alguien la cambió sin aprobarla).
 *
 * Este script NUNCA escribe en `baselines/` ni en `approvals.json`: eso solo lo hace approve.mjs,
 * a mano, y llega a dev por una PR que se revisa.
 *
 * ⚠️ Mismo fichero en deepdots-popup-sdk y en deepdots-popup-mobile-native-sdk.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { comparePng, DEFAULT_COMPARE, maskPng } from './compare.mjs';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** `<device>/<state>.png` de una carpeta (solo un nivel de devices). */
export function listShots(dir, devices = null) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || (devices && !devices.includes(d.name))) continue;
    for (const f of readdirSync(join(dir, d.name))) if (f.endsWith('.png')) out.push(`${d.name}/${f}`);
  }
  return out.sort();
}

/**
 * Tolerancia y máscaras de un device: `visual.json` → defaults + override del device. Una máscara
 * `{x, y, width, height}` (px de la captura) puede limitarse a unos estados (`states: [...]`) o
 * excluir algunos (`except: [...]`), p. ej. cuando el popup tapa justo esa zona.
 */
export function settingsFor(config, device, state = null) {
  const dev = config.devices?.[device] ?? {};
  const applies = (m) => state === null || ((!m.states || m.states.includes(state)) && !m.except?.includes(state));
  return {
    compare: { ...DEFAULT_COMPARE, ...config.compare, ...dev.compare },
    masks: [...(config.masks ?? []), ...(dev.masks ?? [])].filter(applies),
  };
}

/**
 * Decide el resultado de cada captura. Puro: recibe los buffers ya leídos.
 * @param {{config:object, approvals:object, baselines:Map<string,Buffer>, actuals:Map<string,Buffer>}} input
 */
export function evaluate({ config, approvals, baselines, actuals, capturedOnly = false }) {
  const keys = [...new Set([...(capturedOnly ? [] : baselines.keys()), ...actuals.keys()])].sort();
  return keys.map((key) => {
    const [device, file] = key.split('/');
    const state = file.replace(/\.png$/, '');
    const base = baselines.get(key);
    const actual = actuals.get(key);
    const approved = approvals?.baselines?.[key] ?? null;
    const row = { key, device, state, approval: approved?.approvalId ?? null };

    if (!actual) return { ...row, status: 'missing_actual', detail: 'approved baseline has no screenshot in this run' };
    if (!base) return { ...row, status: 'missing_baseline', detail: 'no approved baseline yet (candidate saved)' };
    if (!approved) return { ...row, status: 'unapproved_baseline', detail: 'baseline file has no entry in approvals.json' };
    if (approved.sha256 !== sha256(base)) {
      return { ...row, status: 'unapproved_baseline', detail: 'baseline file changed since it was approved (sha256 mismatch)' };
    }

    const { compare, masks } = settingsFor(config, device, state);
    const result = comparePng(maskPng(base, masks), maskPng(actual, masks), compare);
    const detail = result.sizeChanged
      ? `size ${result.expectedSize.width}×${result.expectedSize.height} → ${result.actualSize.width}×${result.actualSize.height}`
      : `${result.diffPixels} px differ (max ${compare.maxDiffPixels})`;
    return { ...row, status: result.match ? 'pass' : 'diff', detail, diffPixels: result.diffPixels, region: result.region, diff: result.diff };
  });
}

export const passed = (rows) => rows.length > 0 && rows.every((r) => r.status === 'pass');

const ICON = { pass: '✅', diff: '❌', missing_baseline: '🆕', missing_actual: '❓', unapproved_baseline: '⛔' };

export function markdownSummary(rows, meta, { title = 'Visual regression' } = {}) {
  const fails = rows.filter((r) => r.status !== 'pass');
  const lines = [
    `### ${title} · ${passed(rows) ? 'PASSED' : 'FAILED'}`,
    '',
    `SDK **${meta?.sdkVersion ?? '?'}** (${meta?.sdk ?? '?'}) · ${meta?.platform ?? '?'} · ${rows.length} screenshots, ${fails.length} not matching`,
    '',
  ];
  for (const [device, info] of Object.entries(meta?.devices ?? {})) lines.push(`- \`${device}\`: ${info}`);
  if (fails.length) {
    lines.push('', '| | Screenshot | Result |', '|---|---|---|');
    for (const r of fails) lines.push(`| ${ICON[r.status]} | \`${r.key}\` | ${r.status}: ${r.detail} |`);
    lines.push('', 'Reference, current and diff images are in the `visual-report` artifact (report.html).');
    lines.push('To accept an intended change: `node scripts/visual/approve.mjs --run <run id> --reason "…"` and open a PR.');
  }
  return lines.join('\n') + '\n';
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function htmlReport(rows, meta, { title = 'Visual regression' } = {}) {
  const ok = passed(rows);
  const sorted = [...rows].sort((a, b) => (a.status === 'pass') - (b.status === 'pass') || a.key.localeCompare(b.key));
  const img = (dir, r) => (existsSyncRel(dir, r) ? `<a href="${dir}/${esc(r.key)}"><img loading="lazy" src="${dir}/${esc(r.key)}" alt="${dir}"></a>` : '<span class="none">—</span>');
  function existsSyncRel(dir, r) {
    if (dir === 'expected') return r.status !== 'missing_baseline';
    if (dir === 'candidates') return r.status !== 'missing_actual';
    return Boolean(r.diff);
  }
  const devices = Object.entries(meta?.devices ?? {}).map(([d, i]) => `<li><code>${esc(d)}</code> ${esc(i)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;background:#f6f7f9;color:#1d2330}
h1{font-size:20px;margin:0 0 4px}.ok{color:#137333}.ko{color:#b3261e}code{font-size:12px}
.row{background:#fff;border:1px solid #dde1e7;border-radius:8px;margin:12px 0;padding:12px}
.row h2{font-size:14px;margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.grid div{min-width:0}.grid b{display:block;font-size:12px;color:#5f6673;margin-bottom:4px}
img{max-width:100%;border:1px solid #dde1e7;background:#fff}.none{color:#9aa0a6}
</style></head><body>
<h1>${esc(title)} · <span class="${ok ? 'ok' : 'ko'}">${ok ? 'PASSED' : 'FAILED'}</span></h1>
<p>SDK <b>${esc(meta?.sdkVersion)}</b> (${esc(meta?.sdk)}) · ${esc(meta?.platform)} · ${esc(meta?.createdAt ?? '')}${meta?.runUrl ? ` · <a href="${esc(meta.runUrl)}">CI run</a>` : ''}</p>
<ul>${devices}</ul>
${sorted
  .map(
    (r) => `<div class="row" id="${esc(r.key)}"><h2>${ICON[r.status]} <code>${esc(r.key)}</code> · ${esc(r.status)} · ${esc(r.detail)}${r.approval ? ` · approval <code>${esc(r.approval)}</code>` : ''}</h2>
<div class="grid"><div><b>Reference (approved)</b>${img('expected', r)}</div><div><b>Current</b>${img('candidates', r)}</div><div><b>Difference</b>${img('diff', r)}</div></div></div>`,
  )
  .join('\n')}
</body></html>`;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

function main() {
  const suite = arg('suite');
  const actualDir = arg('actual');
  const out = arg('out');
  if (!suite || !actualDir || !out) {
    console.error('Uso: check.mjs --suite <dir> --actual <dir> --out <dir> [--devices a,b] [--title t]');
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(join(suite, 'visual.json'), 'utf8'));
  const approvalsPath = join(suite, 'approvals.json');
  const approvals = existsSync(approvalsPath) ? JSON.parse(readFileSync(approvalsPath, 'utf8')) : { baselines: {}, approvals: [] };
  const metaPath = join(actualDir, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const devices = arg('devices')?.split(',').filter(Boolean) ?? listShots(actualDir).map((k) => k.split('/')[0]).filter((d, i, a) => a.indexOf(d) === i);
  const title = arg('title') ?? config.title ?? 'Visual regression';

  const read = (dir, keys) => new Map(keys.map((k) => [k, readFileSync(join(dir, k))]));
  const baselinesDir = join(suite, 'baselines');
  const baselines = read(baselinesDir, listShots(baselinesDir, devices));
  const actuals = read(actualDir, listShots(actualDir, devices));
  const capturedOnly = process.argv.includes('--captured-only');
  if (capturedOnly) console.log('[visual] --captured-only: states without a screenshot in this run are not checked');
  const rows = evaluate({ config, approvals, baselines, actuals, capturedOnly });

  for (const r of rows) {
    const put = (dir, buf) => {
      const p = join(out, dir, r.key);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, buf);
    };
    if (actuals.has(r.key)) put('candidates', actuals.get(r.key));
    if (baselines.has(r.key)) put('expected', baselines.get(r.key));
    if (r.diff) put('diff', r.diff);
  }
  if (existsSync(metaPath)) copyFileSync(metaPath, join(out, 'candidates', 'meta.json'));
  const results = { title, passed: passed(rows), meta, devices, rows: rows.map(({ diff, ...r }) => r) };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(out, 'summary.md'), markdownSummary(rows, meta, { title }));
  writeFileSync(join(out, 'report.html'), htmlReport(rows, meta, { title }));

  for (const r of rows) console.log(`[visual] ${ICON[r.status]} ${r.key}: ${r.status} · ${r.detail}`);
  console.log(`[visual] ${results.passed ? 'PASSED' : 'FAILED'} · ${rows.length} screenshots · report ${join(out, 'report.html')}`);
  if (!rows.length) console.log('::error::No screenshots and no baselines for these devices: nothing was compared');
  for (const r of rows.filter((x) => x.status !== 'pass')) console.log(`::error::Visual ${r.status}: ${r.key} (${r.detail})`);
  process.exit(results.passed ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
