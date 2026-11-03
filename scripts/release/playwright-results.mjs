#!/usr/bin/env node
/**
 * results.json de Playwright (test app, apps/test-app) -> filas del informe de validación
 * (DD-25, validation-report.mjs): una fila por dispositivo (escritorio / móvil), con el estado
 * de cada test.
 *
 *   playwright-results.mjs apps/test-app/test-results/results.json > rows.json
 *
 * Estados: expected+passed = pass, flaky = retry, unexpected = fail, skipped = skip,
 * expected+failed = known (bug conocido: anotación `known-bug` de KNOWN_BUGS, o `test.fail(true,
 * 'known issue: ...')`) o expected
 * (fallo a propósito, p. ej. el evento de navegación que falta).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ANSI = /\x1b\[[0-9;]*m/g;

const DEVICES = [
  { test: /mobile/, platform: 'Mobile web', device: 'Pixel 7 emulation (412×915)' },
  { test: /desktop/, platform: 'Desktop web', device: 'Desktop 1280×860' },
];

export function testStatus(t) {
  if (t.status === 'skipped') return 'skip';
  if (t.status === 'flaky') return 'retry';
  if (t.status !== 'expected') return 'fail';
  if (t.expectedStatus !== 'failed') return 'pass';
  return knownIssue(t) ? 'known' : 'expected';
}

/** Un `test.fail()` es un bug conocido (KNOWN_BUGS o `known issue: ...`), no un fallo a propósito. */
function knownIssue(t) {
  const a = t.annotations ?? [];
  return a.find((x) => x.type === 'known-bug') ?? a.find((x) => x.type === 'fail' && /^known issue/i.test(x.description ?? ''));
}

function firstError(t) {
  const err = [...(t.results ?? [])].reverse().find((r) => r.error || r.errors?.length);
  const msg = err?.error?.message ?? err?.errors?.[0]?.message ?? '';
  return msg.replace(ANSI, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' — ');
}

export function toRows(report) {
  const rows = new Map();
  const walk = (suite, describe) => {
    const title = suite.title && !/\.spec\.ts$/.test(suite.title) ? suite.title.replace(/^SDK \S+ · /, '') : describe;
    for (const s of suite.suites ?? []) walk(s, title);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const d = DEVICES.find((x) => x.test.test(t.projectName));
        if (!d) continue;
        const row = rows.get(d.platform) ?? {
          label: d.platform, platform: d.platform, os: 'Linux (CI)', device: d.device,
          build: 'Chromium', sdk: '', resolved: '', engine: `Playwright ${report.config?.version ?? ''}`.trim(),
          outcome: 'success', status: {}, messages: {}, notes: {},
        };
        rows.set(d.platform, row);
        const id = `${title} › ${spec.title}`;
        const s = testStatus(t);
        row.status[id] = s;
        if (s === 'fail') row.messages[id] = firstError(t);
        const sdk = (t.annotations ?? []).find((a) => a.type === 'sdk')?.description;
        if (sdk && !row.resolved) row.resolved = sdk.split(' ')[0];
        const bug = knownIssue(t);
        if (bug) row.notes[id] = bug.description.replace(/^known issue:\s*/i, '');
      }
    }
  };
  for (const s of report.suites ?? []) walk(s, '');
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rows = toRows(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
