#!/usr/bin/env node
/**
 * Informe de validación de release (DD-25, antes MF-3210). Lo genera el workflow de test apps
 * a partir de los resultados REALES de sus tests (results.json) y del resultado de cada job: no
 * hay forma de marcar nada como pasado a mano.
 *
 *   validation-report.mjs --results results.json --version X.Y.Z --out out/ \
 *     [--jobs job=success,...] [--changelog CHANGELOG.md] [--flows-dir dir] [--run-url URL] \
 *     [--release-url URL] [--date YYYY-MM-DD] [--control X.Y.Z]
 *
 * results.json: una fila por configuración probada
 *   {label, platform, os, device, build, sdk, resolved, engine, outcome, status: {test: s}, messages: {test: msg}}
 * con s = pass | retry | fail | error (no llegó a correr) | skip | known (bug conocido) | expected (falla a propósito).
 * La config del repo (producto, plataformas, controles, categorías) está en validation/report.json.
 *
 * Escribe out/report.md, out/report.html (el PDF lo imprime el workflow con Chrome) y
 * out/summary.json ({status, platforms, counts, failures, knownIssues}) para el aviso de Slack.
 *
 *   validation-report.mjs slack --summary out/summary.json --link "Report=URL"... [--test] [--print]
 *     aviso de Slack con el resultado (SLACK_WEBHOOK_URL; sin webhook avisa y sale con 0)
 *   validation-report.mjs index <dir>
 *     index.html de los informes publicados (una carpeta por versión con su summary.json)
 *
 * El informe es genérico (sin cliente): un anexo de cliente se añade a mano sobre el PDF.
 * Mismo fichero en deepdots-popup-sdk y deepdots-popup-mobile-native-sdk: cambiarlo en los dos.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { extractSection } from './slack-notify.mjs';

export const CONFIG = JSON.parse(readFileSync(new URL('./validation/report.json', import.meta.url), 'utf8'));
export const STATUS = { passed: 'PASSED', known: 'PASSED WITH KNOWN ISSUES', failed: 'FAILED' };

const PASSING = new Set(['pass', 'retry', 'expected']);
const FAILING = new Set(['fail', 'error']);
const fill = (text, version) => String(text ?? '').replaceAll('{version}', version);

/** Estado de una celda (varias filas, un test o una categoría). */
export function aggregate(statuses) {
  const ran = statuses.filter(Boolean);
  if (!ran.length) return 'NOT RUN';
  if (ran.some((s) => FAILING.has(s))) return 'FAIL';
  if (ran.every((s) => s === 'skip')) return 'n/a';
  if (ran.some((s) => s === 'known')) return 'PASS (known issue)';
  return 'PASS';
}

/** Categoría de un test: por nombre exacto (`flows`) o por regex sobre su id (`match`). */
export function categoryOf(test, config = CONFIG) {
  return config.categories.find((c) => c.flows?.includes(test) || c.match?.some((m) => new RegExp(m).test(test)))?.name ?? 'Other checks';
}

/** Resultado global: cualquier fallo, error, job rojo o plataforma sin filas = FAILED. */
export function evaluate(rows, jobs = {}, config = CONFIG) {
  const failures = [];
  const knownIssues = new Map();
  const known = new Set();
  for (const { name } of config.platforms) {
    const mine = rows.filter((r) => r.platform === name);
    if (!mine.length) failures.push({ platform: name, row: '—', flow: '—', message: 'No results: the platform did not run' });
    for (const r of mine) {
      let rowFailed = false;
      for (const [flow, s] of Object.entries(r.status ?? {})) {
        if (FAILING.has(s)) {
          rowFailed = true;
          failures.push({ platform: name, row: r.label, flow, message: r.messages?.[flow] ?? '' });
        }
        if (s === 'known') {
          known.add(name);
          knownIssues.set(flow, [...(knownIssues.get(flow) ?? []), r.label]);
        }
      }
      // Todos los tests en verde pero la fila en rojo: device log (crash/ANR), aislamiento de prod...
      if (!rowFailed && r.outcome !== 'success') {
        failures.push({ platform: name, row: r.label, flow: '—', message: `Configuration ${r.outcome ?? 'did not finish'}: device log or production-isolation check failed` });
      }
    }
  }
  // Un job rojo (cancelado, timeout) sin ningún test rojo en sus plataformas.
  for (const job of new Set(config.platforms.map((p) => p.job))) {
    const names = config.platforms.filter((p) => p.job === job).map((p) => p.name);
    if (jobs[job] && jobs[job] !== 'success' && !failures.some((f) => names.includes(f.platform))) {
      for (const name of names) failures.push({ platform: name, row: '—', flow: '—', message: `Job ${jobs[job]} without a failing test (cancelled or timed out)` });
    }
  }
  const controlPlatform = config.platforms.at(-1).name;
  for (const [job, label] of Object.entries(config.controls ?? {})) {
    if (jobs[job] && jobs[job] !== 'success') failures.push({ platform: controlPlatform, row: 'control', flow: job, message: `${label}: ${jobs[job]}` });
  }
  const platforms = Object.fromEntries(
    config.platforms.map(({ name }) => [name, failures.some((f) => f.platform === name) ? STATUS.failed : known.has(name) ? STATUS.known : STATUS.passed]),
  );
  const status = failures.length ? STATUS.failed : knownIssues.size ? STATUS.known : STATUS.passed;
  const counts = { executions: 0, passed: 0, retried: 0, failed: 0, skipped: 0, known: 0 };
  for (const r of rows) {
    for (const s of Object.values(r.status ?? {})) {
      counts.executions++;
      if (PASSING.has(s)) counts.passed++;
      if (s === 'retry') counts.retried++;
      if (FAILING.has(s)) counts.failed++;
      if (s === 'skip') counts.skipped++;
      if (s === 'known') counts.known++;
    }
  }
  return { status, platforms, failures, knownIssues: Object.fromEntries(knownIssues), counts };
}

/** Descripción de un flujo de Maestro: la primera frase de su comentario de cabecera. */
function flowDescription(flowsDir, flow) {
  if (!flowsDir || !existsSync(flowsDir)) return '';
  for (const dir of readdirSync(flowsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const file = join(flowsDir, dir.name, `${flow}.yaml`);
    if (!existsSync(file)) continue;
    const block = (readFileSync(file, 'utf8').match(/^(?:#[^\n]*\n)+/)?.[0] ?? '').replace(/^# ?/gm, '').replace(/\s+/g, ' ').trim();
    return block.split(/(?<=\.)\s/)[0];
  }
  return '';
}

const cell = (s) => (s === 'FAIL' ? '**FAIL**' : s);
/** Celda de una plataforma: `—` si esa plataforma no corre ninguno de esos tests. */
const platformCell = (statuses) => (statuses.some(Boolean) ? cell(aggregate(statuses)) : '—');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function buildMarkdown({ rows, jobs = {}, version, date, changelog = '', runUrl, releaseUrl, control, flowsDir, digest, config = CONFIG }) {
  const result = evaluate(rows, jobs, config);
  const { status, platforms, failures, knownIssues, counts } = result;
  const P = config.platforms.map((p) => p.name);
  const byPlatform = (name) => rows.filter((r) => r.platform === name);
  const testStatus = (name, test) => byPlatform(name).map((r) => r.status?.[test]);
  const allTests = [...new Set(rows.flatMap((r) => Object.keys(r.status ?? {})))].sort();
  const categories = [...config.categories.map((c) => c.name), 'Other checks']
    .map((name) => ({ name, tests: allTests.filter((t) => categoryOf(t, config) === name) }))
    .filter((c) => c.tests.length);
  const releaseLink = releaseUrl ?? `${config.repo}/releases/tag/${config.tagPrefix ?? 'v'}${version}`;
  const notes = extractSection(changelog, version);
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const L = [];

  L.push('# Deepdots | Popup SDK Release Validation Report', '');
  L.push(`**SDK:** ${config.product} **${version}** (${fill(config.packages, version)})  `);
  L.push(`**Validation date:** ${date}  `);
  L.push(`**Platforms:** ${P.join(' / ')}  `);
  L.push(`**Overall status:** **${status}**  `);
  L.push('**Report type:** Automated release validation, generated from the CI test results (no manual edits)', '');
  L.push('---', '', '## 1. Executive Summary', '', fill(config.intro, version), '');
  L.push(`Results${runUrl ? ` ([CI run](${runUrl}))` : ''}:`, '');
  L.push(`- **${counts.executions}** automated test executions on **${rows.length}** configurations (${P.map((p) => `${byPlatform(p).length} ${p}`).join(', ')})`);
  L.push(`- **${counts.passed}** passed${counts.retried ? ` (${counts.retried} on the automatic retry)` : ''}`);
  L.push(`- **${counts.failed}** failed`);
  if (counts.known) L.push(`- **${counts.known}** known non-blocking issues (section 6)`);
  if (counts.skipped) L.push(`- **${counts.skipped}** not applicable on that platform`);
  L.push(`- Manual pass on real devices: **pending** (section 7)`, '');
  L.push(P.map((p) => `**${p}:** ${platforms[p]}`).join(' · '), '');
  L.push(`**Validation status:** **${status}**`, '');
  if (failures.length) {
    L.push('### Failures', '', '| Platform | Configuration | Test | Detail |', '|---|---|---|---|');
    for (const f of failures) L.push(row([f.platform, esc(f.row), esc(f.flow), esc(f.message).slice(0, 200)]));
    L.push('');
  }

  L.push('## 2. Test Results', '', row(['Test category', ...P]), `|---|${P.map(() => '---|').join('')}`);
  for (const c of categories) L.push(row([c.name, ...P.map((p) => platformCell(c.tests.flatMap((t) => testStatus(p, t))))]));
  L.push(row(['Visual regression', ...P.map(() => config.visualRegression ?? 'NOT YET AUTOMATED')]), '');
  L.push('`—` = not part of that platform\'s suite.', '');
  L.push('<details><summary>Every test on every configuration</summary>', '');
  L.push(row(['Test', ...rows.map((r) => esc(r.label))]), `|---|${rows.map(() => '---|').join('')}`);
  for (const t of allTests) L.push(row([esc(t), ...rows.map((r) => r.status?.[t] ?? '–')]));
  L.push('', '</details>', '');

  L.push('## 3. Tested Environments', '', '| Platform | OS version | Device | Build | SDK resolved | Engine | Result |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const ok = !Object.values(r.status ?? {}).some((s) => FAILING.has(s)) && r.outcome === 'success';
    L.push(row([r.platform, esc(r.os), esc(r.device), esc(r.build), esc(r.resolved), esc(r.engine) || '—', ok ? 'PASS' : '**FAIL**']));
  }
  L.push('', config.environmentNote ?? '', '');

  L.push('## 4. Critical Safety Validation', '', row(['Scenario', ...P]), `|---|${P.map(() => '---|').join('')}`);
  for (const s of config.safety ?? []) {
    const tests = allTests.filter((t) => t === s.flow || (s.match && new RegExp(s.match).test(t)));
    if (tests.length) L.push(row([s.label, ...P.map((p) => platformCell(tests.flatMap((t) => testStatus(p, t))))]));
  }
  // Una fila con todos sus tests en verde y en rojo igualmente: la ha tumbado su comprobación global.
  const logFailed = (r) => r.outcome !== 'success' && !Object.values(r.status ?? {}).some((s) => FAILING.has(s));
  if (config.deviceLogCheck) L.push(row([config.deviceLogCheck, ...P.map((p) => (byPlatform(p).some(logFailed) ? '**Check failed**' : 'None detected'))]));
  L.push('');

  L.push('## 5. Detection Controls and Backward Compatibility', '');
  L.push('The test system has to prove it catches real problems. These controls run in every validation:', '', '| Control | Result |', '|---|---|');
  for (const [job, label] of Object.entries(config.controls ?? {})) {
    const res = jobs[job];
    L.push(row([`${label}${control ? ` (control ${control})` : ''}`, res ? (res === 'success' ? 'PASS' : `**FAIL** (${res})`) : 'NOT RUN']));
  }
  for (const t of allTests.filter((t) => rows.some((r) => r.status?.[t] === 'expected'))) {
    const ran = P.filter((p) => testStatus(p, t).some(Boolean));
    L.push(row([`Expected failure detected: ${esc(t)}`, ran.map((p) => `${p} ${aggregate(testStatus(p, t))}`).join(' · ')]));
  }
  L.push('');

  L.push('## 6. Known Issues & Limitations', '');
  L.push(`**Known blocking issues:** ${failures.length ? 'see Failures in section 1.' : 'none identified.'}`, '');
  L.push('**Known non-blocking issues:**', '');
  const known = Object.entries(knownIssues);
  if (!known.length) L.push('- None.');
  for (const [flow, labels] of known) {
    const desc = flowDescription(flowsDir, flow) || rows.find((r) => r.notes?.[flow])?.notes[flow] || 'known issue';
    L.push(`- \`${flow}\`: ${desc} (seen on: ${labels.join(', ')})`);
  }
  L.push('', '**Test limitations:**', '', ...(config.limitations ?? []).map((l) => `- ${l}`), '');

  const rd = config.realDevices;
  if (rd) {
    L.push('## 7. Real Devices (manual)', '', `**Status: PENDING.** ${rd.intro}`, '');
    L.push(row(['Check', ...rd.devices]), `|---|${rd.devices.map(() => '---|').join('')}`);
    for (const c of rd.checks) L.push(row([c, ...rd.devices.map(() => 'pending')]));
    L.push('');
  }

  L.push('## 8. Release Information', '');
  L.push(`- **SDK version:** ${version}`);
  L.push(`- **Release:** [GitHub release ${config.tagPrefix ?? 'v'}${version}](${releaseLink})`);
  L.push(`- **Changelog:** [CHANGELOG](${config.repo}/blob/main/CHANGELOG.md)`);
  if (runUrl) L.push(`- **Test execution:** [CI run](${runUrl}) (logs, screenshots and per-configuration artifacts)`);
  L.push(`- **Validation date:** ${date}`);
  if (digest) L.push(`- **Results file SHA-256:** \`${digest}\``);
  L.push('');
  if (notes) L.push(`### Release notes ${version}`, '', notes.replace(/^### /gm, '#### '), '');

  return { markdown: L.join('\n'), result };
}

const CSS = `@page { size: A4; margin: 18mm 16mm; }
body { font: 10.5pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1d24; background: #fff; max-width: 180mm; margin: auto; padding: 0 16px; }
h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 14pt; margin-top: 20pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
h3 { font-size: 11.5pt; margin-top: 14pt; } code { font-size: 9pt; background: #f2f3f5; padding: 0 3px; border-radius: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin: 8pt 0; page-break-inside: avoid; display: block; overflow-x: auto; }
th, td { border: 1px solid #d6d8dc; padding: 3pt 4pt; text-align: left; vertical-align: top; } th { background: #f2f3f5; }
details table { font-size: 7pt; } summary { cursor: pointer; color: #1f5fbf; }
@media print { details { display: none; } table { display: table; } body { padding: 0; } }
hr { border: 0; border-top: 1px solid #ddd; margin: 16pt 0; } h2:has(+ *) { page-break-after: avoid; }
a { color: #1f5fbf; }`;

export function toHtml(markdown, title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style></head><body>
${marked.parse(markdown, { gfm: true })}
</body></html>
`;
}

const ICON = { [STATUS.passed]: '✅', [STATUS.known]: '⚠️', [STATUS.failed]: '❌' };
const slackEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const MAX_FAILURES = 5;

/** Aviso de Slack del resultado: estado, plataformas, enlaces y los primeros fallos. */
export function buildSlackMessage(summary, { links = [], test = false, product = CONFIG.product } = {}) {
  const { version, status, platforms, counts, failures = [], knownIssues = {} } = summary;
  const lines = [
    `${test ? '🧪 TEST — ' : ''}${ICON[status]} *${slackEscape(product)} ${slackEscape(version)}* · release validation *${status}*`,
    `${Object.entries(platforms).map(([p, st]) => `${p}: ${st}`).join(' · ')} · ${counts.passed}/${counts.executions} automated tests passed · real devices: pending`,
  ];
  if (links.length) lines.push(links.map(({ label, url }) => `<${url}|${slackEscape(label)}>`).join(' · '));
  for (const f of failures.slice(0, MAX_FAILURES)) {
    lines.push(`• ❌ ${slackEscape([f.platform, f.row, f.flow].filter((x) => x && x !== '—').join(' · '))}${f.message ? `: ${slackEscape(f.message.slice(0, 140))}` : ''}`);
  }
  if (failures.length > MAX_FAILURES) lines.push(`…and ${failures.length - MAX_FAILURES} more failures`);
  for (const [flow, rows] of Object.entries(knownIssues)) lines.push(`• ⚠️ Known issue \`${slackEscape(flow)}\` (${slackEscape(rows.join(', '))})`);
  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}

/** Índice de los informes publicados, el más nuevo primero. */
export function buildIndex(entries, product = CONFIG.product) {
  const key = (v) => v.split(/[.-]/).map((n) => Number(n) || 0);
  const sorted = [...entries].sort((a, b) => {
    const [x, y] = [key(a.version), key(b.version)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
  const md = [`# ${product} · Release validation reports`, '', '| Version | Status | Report |', '|---|---|---|'];
  for (const e of sorted) md.push(`| ${e.version} | ${e.status} | [HTML](${e.version}/report.html) · [PDF](${e.version}/${e.pdf}) |`);
  md.push('', 'Generated automatically from the CI test results of each release.');
  return toHtml(md.join('\n'), 'Release validation reports');
}

async function slack(argv) {
  const links = [];
  let summaryFile;
  let test = false;
  let print = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--summary') summaryFile = argv[++i];
    else if (argv[i] === '--link') {
      const raw = argv[++i];
      const at = raw.indexOf('=');
      links.push({ label: raw.slice(0, at), url: raw.slice(at + 1) });
    } else if (argv[i] === '--test') test = true;
    else if (argv[i] === '--print') print = true;
  }
  const payload = buildSlackMessage(JSON.parse(readFileSync(summaryFile, 'utf8')), { links, test });
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (print || !webhook) {
    if (!print) console.log('::warning::Sin SLACK_WEBHOOK_URL (secret SDK_RELEASES_SLACK_WEBHOOK_URL): no se avisa en Slack.');
    console.log(payload.text);
    return;
  }
  const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  // No se imprime la URL: es el secret.
  if (!res.ok) console.log(`::warning::Slack respondio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  else console.log(`Aviso enviado a Slack:\n${payload.text}`);
}

function index(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'summary.json')))
    .map((d) => ({
      version: d.name,
      status: JSON.parse(readFileSync(join(dir, d.name, 'summary.json'), 'utf8')).status,
      pdf: readdirSync(join(dir, d.name)).find((f) => f.endsWith('.pdf')) ?? 'report.html',
    }));
  writeFileSync(join(dir, 'index.html'), buildIndex(entries));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function main() {
  if (process.argv[2] === 'slack') return slack(process.argv.slice(3));
  if (process.argv[2] === 'index') return index(process.argv[3]);
  const a = parseArgs(process.argv.slice(2));
  if (!a.results || !a.version || !a.out) {
    console.error('usage: validation-report.mjs --results results.json --version X.Y.Z --out dir [...]');
    process.exit(2);
  }
  const raw = readFileSync(a.results);
  const jobs = Object.fromEntries((a.jobs ?? '').split(',').filter(Boolean).map((kv) => kv.split('=')));
  const { markdown, result } = buildMarkdown({
    rows: JSON.parse(raw),
    jobs,
    version: a.version,
    date: a.date ?? new Date().toISOString().slice(0, 10),
    changelog: a.changelog ? readFileSync(a.changelog, 'utf8') : '',
    runUrl: a['run-url'],
    releaseUrl: a['release-url'],
    control: a.control,
    flowsDir: a['flows-dir'],
    digest: createHash('sha256').update(raw).digest('hex'),
  });
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, 'report.md'), markdown);
  writeFileSync(join(a.out, 'report.html'), toHtml(markdown, `${CONFIG.product} ${a.version} Release Validation Report`));
  writeFileSync(join(a.out, 'summary.json'), JSON.stringify({ version: a.version, ...result }, null, 2));
  console.log(`[report] ${a.version}: ${result.status} (${result.counts.passed}/${result.counts.executions} passed, ${result.failures.length} failures)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  Promise.resolve(main()).catch((err) => {
    console.log(`::error::${err.message}`);
    process.exitCode = 1;
  });
}
