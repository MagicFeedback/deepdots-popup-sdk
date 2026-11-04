import { describe, expect, it } from 'vitest';
import { evaluateRelease, failingChecks, requiredChecksFrom } from './required-checks.mjs';

const green = [
  { name: 'Tests & build', conclusion: 'success', started_at: '1' },
  { name: 'E2E (Playwright)', conclusion: 'success', started_at: '1' },
  { name: 'Smoke + regression · SDK local', conclusion: 'success', started_at: '1' },
  { name: 'Smoke + regression · SDK 1.16.1', conclusion: 'failure', started_at: '1' },
];

describe('required-checks', () => {
  it('all green: nothing blocks (other SDK versions of the test app do not count)', () => {
    expect(failingChecks(requiredChecksFrom(green))).toEqual([]);
  });

  it('a red test app on the release build blocks the release', () => {
    const runs = [...green, { name: 'Smoke + regression · SDK local', conclusion: 'failure', started_at: '2', html_url: 'u' }];
    expect(failingChecks(requiredChecksFrom(runs))).toEqual(['"Smoke + regression · SDK local" failure u']);
  });

  it('a missing or running check blocks it too', () => {
    const runs = [green[0], { name: 'E2E (Playwright)', status: 'in_progress', conclusion: null, started_at: '1' }];
    expect(failingChecks(requiredChecksFrom(runs))).toEqual(['"E2E (Playwright)" in_progress', '"Smoke + regression · SDK local" missing']);
  });
});

// DD-27: checks que faltan bloquean; excepción de emergencia explícita en la PR de release.

const GREEN = ['Tests & build', 'E2E (Playwright)', 'Smoke + regression · SDK local'].map((name) => ({ name, conclusion: 'success', started_at: '1' }));
const RED = GREEN.map((c) => (c.name.startsWith('Smoke') ? { ...c, conclusion: 'failure', html_url: 'u' } : c));
const REASON = '## Release gate override\nDEV API down since 09:00; hotfix for a crash in prod, checked by hand on Safari and Chrome.\n';
function fakeApi({ runs = GREEN, pulls = [{ number: 70, merged_at: 't', merge_commit_sha: 'tag', base: { ref: 'dev' } }], labels = [], body = '', events = [], permission = 'admin' } = {}) {
  return (path) => {
    if (path.includes('/commits/tag/check-runs')) return { check_runs: runs };
    if (path.endsWith('/commits/tag/pulls')) return pulls;
    if (path.endsWith('/pulls/70')) return { number: 70, labels, body };
    if (path.includes('/issues/70/events')) return events;
    if (path.includes('/permission')) return { permission };
    throw new Error(`unexpected ${path}`);
  };
}
const gate = (o) => evaluateRelease({ repo: 'o/r', sha: 'tag', api: fakeApi(o) });
const labelled = (login) => [{ event: 'labeled', label: { name: 'release-gate-override' }, actor: { login }, created_at: '2026-11-04T10:00:00Z' }];

it('gate: green on the tagged commit passes', () => {
  expect(gate().ok).toBe(true);
});

it('gate: a missing check (no evidence) blocks', () => {
  const r = gate({ runs: GREEN.slice(0, 2) });
  expect(r.ok).toBe(false);
  expect(r.errors[0]).toMatch(/"Smoke \+ regression · SDK local" missing/);
});

it('gate: override by an admin with a reason passes and is reported', () => {
  const r = gate({ runs: RED, labels: [{ name: 'release-gate-override' }], body: REASON, events: labelled('sarias980') });
  expect(r.ok).toBe(true);
  expect(r.override.by).toBe('sarias980');
  expect(r.override.failing).toEqual(['"Smoke + regression · SDK local" failure u']);
});

it('gate: override refused without admin, without reason, or without a release PR', () => {
  expect(gate({ runs: RED, labels: [{ name: 'release-gate-override' }], body: REASON, events: labelled('x'), permission: 'write' }).ok).toBe(false);
  expect(gate({ runs: RED, labels: [{ name: 'release-gate-override' }], body: '', events: labelled('sarias980') }).ok).toBe(false);
  expect(gate({ runs: RED, pulls: [] }).ok).toBe(false);
});
