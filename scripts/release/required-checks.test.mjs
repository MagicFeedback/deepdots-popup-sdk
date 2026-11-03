import { describe, expect, it } from 'vitest';
import { failingChecks, requiredChecksFrom } from './required-checks.mjs';

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
