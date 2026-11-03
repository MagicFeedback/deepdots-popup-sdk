// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toRows, testStatus } from './playwright-results.mjs';
import { aggregate, buildMarkdown, buildSlackMessage, categoryOf, evaluate, STATUS } from './validation-report.mjs';

const spec = (title, tests) => ({ title, tests });
const t = (projectName, status, extra = {}) => ({ projectName, status, expectedStatus: 'passed', annotations: [{ type: 'sdk', description: '1.18.1 (1.18.1) · DEV' }], results: [], ...extra });
const DESK = 'regression · web desktop chromium · sdk 1.18.1';
const MOB = 'regression · web mobile chromium (Pixel 7) · sdk 1.18.1';

const report = (overrides = {}) => ({
  config: { version: '1.56.0' },
  suites: [
    {
      title: 'regression/host-safety.spec.ts',
      suites: [
        {
          title: 'SDK 1.18.1 · host safety',
          specs: [
            spec('popup en esquina (top-left): fuera de la tarjeta, los clics llegan al host', [t(DESK, 'expected'), t(MOB, 'expected')]),
            spec('sin red (offline) al abrir: el popup avisa, se cierra y la SPA sigue navegando', [t(DESK, overrides.offline ?? 'expected', overrides.offlineExtra), t(MOB, 'flaky')]),
          ],
        },
      ],
    },
    {
      title: 'failures.spec.ts',
      suites: [{ title: 'SDK 1.18.1 · missing navigation event', specs: [spec('sin evento de navegación, el exit trigger no salta y el test lo detecta', [t(DESK, 'expected', { expectedStatus: 'failed' })])] }],
    },
  ],
});

describe('playwright-results', () => {
  it('maps Playwright states to report states', () => {
    expect(testStatus({ status: 'expected', expectedStatus: 'passed' })).toBe('pass');
    expect(testStatus({ status: 'flaky' })).toBe('retry');
    expect(testStatus({ status: 'unexpected' })).toBe('fail');
    expect(testStatus({ status: 'skipped' })).toBe('skip');
    expect(testStatus({ status: 'expected', expectedStatus: 'failed', annotations: [{ type: 'known-bug' }] })).toBe('known');
    expect(testStatus({ status: 'expected', expectedStatus: 'failed' })).toBe('expected');
    expect(testStatus({ status: 'expected', expectedStatus: 'failed', annotations: [{ type: 'fail', description: 'known issue: z-index' }] })).toBe('known');
  });

  it('one row per device, test ids without the SDK prefix', () => {
    const rows = toRows(report());
    expect(rows.map((r) => r.label)).toEqual(['Desktop web', 'Mobile web']);
    expect(rows[0].resolved).toBe('1.18.1');
    expect(rows[0].status).toEqual({
      'host safety › popup en esquina (top-left): fuera de la tarjeta, los clics llegan al host': 'pass',
      'host safety › sin red (offline) al abrir: el popup avisa, se cierra y la SPA sigue navegando': 'pass',
      'missing navigation event › sin evento de navegación, el exit trigger no salta y el test lo detecta': 'expected',
    });
    expect(rows[1].status['host safety › sin red (offline) al abrir: el popup avisa, se cierra y la SPA sigue navegando']).toBe('retry');
  });

  it('a failing test keeps its first error line, without ANSI codes', () => {
    const rows = toRows(report({ offline: 'unexpected', offlineExtra: { results: [{ error: { message: '\u001b[2mexpect(locator).toBeVisible()\u001b[22m failed\n\nExpected: visible' } }] } }));
    const r = evaluate(rows, { web: 'failure' });
    expect(r.platforms).toEqual({ 'Desktop web': STATUS.failed, 'Mobile web': STATUS.passed });
    expect(r.failures[0].message).toBe('expect(locator).toBeVisible() failed — Expected: visible');
  });
});

describe('validation-report (web config)', () => {
  it('all green: PASSED, with the safety and detection rows', () => {
    const rows = toRows(report());
    expect(evaluate(rows, { web: 'success' }).status).toBe(STATUS.passed);
    const { markdown } = buildMarkdown({ rows, jobs: { web: 'success' }, version: '1.18.1', date: '2026-11-03' });
    expect(markdown).toMatch(/\| Test category \| Desktop web \| Mobile web \|/);
    expect(markdown).toMatch(/\| Clicks outside a corner popup reach the page \| PASS \| PASS \|/);
    expect(markdown).toMatch(/Expected failure detected: missing navigation event/);
    expect(markdown).toMatch(/npm `@magicfeedback\/popup-sdk@1\.18\.1`/);
  });

  it('slack: FAILED names the test', () => {
    const rows = toRows(report({ offline: 'unexpected' }));
    const { text } = buildSlackMessage({ version: '1.18.1', ...evaluate(rows, { web: 'failure' }) }, { test: true });
    expect(text).toMatch(/^🧪 TEST — ❌ \*Deepdots web popup SDK 1\.18\.1\* · release validation \*FAILED\*/);
    expect(text).toMatch(/• ❌ Desktop web · host safety › sin red/);
  });

  it('aggregate keeps failures first', () => {
    expect(aggregate(['pass', 'fail', 'known'])).toBe('FAIL');
  });

  it('every test of the test app counts for a report category', () => {
    const app = fileURLToPath(new URL('../../apps/test-app/', import.meta.url));
    const out = execFileSync('npx', ['playwright', 'test', '-c', 'playwright.config.ts', '--list', '--reporter=json'], {
      cwd: app,
      env: { ...process.env, SDK_VERSION: '1.18.1' },
      encoding: 'utf8',
    });
    const ids = [...new Set(toRows(JSON.parse(out)).flatMap((r) => Object.keys(r.status)))];
    expect(ids.length).toBeGreaterThan(40);
    expect(ids.filter((id) => categoryOf(id) === 'Other checks')).toEqual([]);
  }, 60_000);
});
