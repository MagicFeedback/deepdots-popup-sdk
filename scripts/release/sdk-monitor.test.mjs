import { describe, expect, it } from 'vitest';
import { buildReport, decide, emptyState, keepUndelivered, failureMessage, fromPlaywright, recoveryMessage, scenarioOf, toRows, watch } from './sdk-monitor.mjs';

const env = { GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'MagicFeedback/x', GITHUB_EVENT_NAME: 'schedule' };
const now = new Date('2026-11-05T07:05:00Z');

const spec = (title, results, status = 'expected') => ({ title, tests: [{ status, results }] });
const pw = {
  suites: [
    {
      suites: [
        {
          specs: [
            spec('init · the SDK loads', [{ status: 'passed', duration: 900, startTime: '2026-11-05T07:00:00Z', attachments: [] }]),
            spec(
              'submit · answer and send',
              [
                { status: 'failed', duration: 20000, startTime: '2026-11-05T07:00:01Z', error: { message: 'Timed out\u001b[2m waiting' }, attachments: [] },
                { status: 'failed', duration: 20000, error: { message: 'Timed out waiting' }, attachments: [{ name: 'screenshot', path: '/tmp/a.png' }] },
              ],
              'unexpected',
            ),
            spec('popups-error · host usable', [{ status: 'failed', duration: 100 }, { status: 'passed', duration: 100 }], 'flaky'),
            spec('not a monitor test', [{ status: 'passed', duration: 1 }]),
          ],
        },
      ],
    },
  ],
};

const rows = (checks, extra = {}) => toRows(checks, { platform: 'web', sdk: '1.17.2', source: 'npm', env, now, ...extra });
const check = (scenario, status, extra = {}) => ({ scenario, status, retried: false, started: '2026-11-05T07:00:00Z', duration_ms: 1, message: status === 'fail' ? 'boom' : null, evidence: [], ...extra });

describe('collect', () => {
  it('reads only the monitor scenarios, the retry and the evidence from Playwright', () => {
    const checks = fromPlaywright(pw);
    expect(checks.map((c) => [c.scenario, c.status, c.retried])).toEqual([
      ['init', 'pass', false],
      ['submit', 'fail', true],
      ['popups-error', 'pass', true],
    ]);
    expect(checks[1].message).toBe('Timed out waiting');
    expect(checks[1].evidence).toEqual([{ name: 'screenshot', path: '/tmp/a.png' }]);
    expect(scenarioOf('monitor-trigger-render')).toBe('trigger-render');
  });

  it('a run without results is one monitor_error row, with the ticket fields', () => {
    const [r] = rows([], { jobStatus: 'failure' });
    expect(r.scenario).toBe('monitor');
    expect(r.failure_category).toBe('monitor_error');
    expect(r.message).toContain('Web job ended failure');
    const [ok] = rows([check('submit', 'fail')], { fault: 'survey406' });
    expect(ok).toMatchObject({ platform: 'web', sdk_version: '1.17.2', environment: 'dev', scenario: 'submit', failure_category: 'submission', injected_fault: 'survey406', trigger: 'schedule' });
    expect(ok.run_url).toBe('https://github.com/MagicFeedback/x/actions/runs/42');
  });
  it('rows have exactly the BigQuery columns (MagicSurvey monitoring/infra/sdk_check_results.bq.json)', () => {
    const [r] = rows([check('init', 'pass')]);
    const { sdk_log, ...row } = { ...r, sdk_log: null };
    expect(Object.keys(row).sort()).toEqual(["check_id", "commit", "duration_ms", "environment", "environment_url", "evidence", "failure_category", "injected_fault", "message", "platform", "repo", "retried", "run_id", "run_url", "scenario", "scenario_name", "schema_version", "sdk_requested", "sdk_source", "sdk_version", "status", "timestamp", "trigger"]);
  });
});

describe('decide', () => {
  it('alerts a new failure, reminds after the interval, then recovers', () => {
    const fail = rows([check('submit', 'fail')]);
    const first = decide(fail, emptyState(), now, env);
    expect(first.alert).toHaveLength(1);
    expect(first.alert[0].since).toBe(null);

    const soon = decide(fail, first.state, new Date('2026-11-05T08:05:00Z'), env);
    expect(soon.alert).toHaveLength(0);
    const later = decide(fail, first.state, new Date('2026-11-05T13:06:00Z'), env);
    expect(later.alert).toHaveLength(1);
    expect(later.alert[0].since).toBe('2026-11-05T07:00:00Z');

    const back = decide(rows([check('submit', 'pass')]), later.state, now, env);
    expect(back.recovered).toHaveLength(1);
    expect(back.state.incidents).toEqual({});
  });

  it('a message that did not reach Slack is told on the next run', () => {
    const fail = rows([check('submit', 'fail')]);
    const first = decide(fail, emptyState(), now, env);
    const lost = keepUndelivered(first.state, first.alert.map((v) => ({ v, ok: false })), []);
    expect(decide(fail, lost, new Date('2026-11-05T08:05:00Z'), env).alert).toHaveLength(1);
    const pass = decide(rows([check('submit', 'pass')]), first.state, now, env);
    const kept = keepUndelivered(pass.state, [], pass.recovered.map((v) => ({ v, ok: false })));
    expect(decide(rows([check('submit', 'pass')]), kept, now, env).recovered).toHaveLength(1);
  });

  it('a monitor_error is told once and closes when the platform runs again', () => {
    const broken = decide(rows([]), emptyState(), now, env);
    expect(broken.alert).toHaveLength(1);
    expect(decide(rows([]), broken.state, new Date('2026-11-06T07:05:00Z'), env).alert).toHaveLength(0);
    const ran = decide(rows([check('init', 'pass')]), broken.state, now, env);
    expect(ran.recovered.map((x) => x.incident.scenario)).toEqual(['monitor']);
  });
});

describe('messages', () => {
  it('failure: platform, SDK, environment, scenario, cause, links; TEST on manual runs', () => {
    const [r] = rows([check('submit', 'fail', { evidence: [{ name: 'a.png', url: 'https://x/a.png' }] })]);
    const text = failureMessage({ row: r, since: null }, { reportUrl: 'https://r/', env }).blocks[0].text.text;
    expect(text).toContain('*Popup SDK* · Web · `1.17.2` (npm latest) · dev · *answer → submit* failed (submission): boom');
    expect(text).toContain('<https://x/a.png|screenshot> · <https://r/|report> · <https://github.com/MagicFeedback/x/actions/runs/42|run>');
    expect(failureMessage({ row: r, since: null }, { env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' } }).text).toContain('TEST — ');
  });

  it('recovery says what was broken and for how long', () => {
    const [r] = rows([check('submit', 'pass')]);
    const msg = recoveryMessage({ incident: { scenario: 'submit', category: 'submission', since: '2026-11-05T05:05:00Z' }, row: r }, { now, env });
    expect(msg.text).toContain('Popup SDK recovered');
    expect(msg.text).toContain('was submission since 05:05 UTC, 2 h');
  });

  it('report: the ticket fields and the runbook by platform', () => {
    const md = buildReport(rows([check('init', 'pass'), check('submit', 'fail')]), { platform: 'web', now });
    expect(md).toContain('| SDK version | 1.17.2 (npm `latest`) |');
    expect(md).toContain('| Failed scenario | answer → submit (`submit`) |');
    expect(md).toContain('move npm `latest` back');
    const native = buildReport(toRows([check('init', 'fail')], { platform: 'ios', sdk: '0.7.9', source: 'spm', env, now }), { platform: 'ios', now });
    expect(native).toContain('cannot be pulled from customer apps');
  });
});

describe('watch', () => {
  const fresh = { at: '2026-11-05T06:30:00Z', conclusion: 'success', sdk: '1', failing: [] };
  it('a silent platform is told once, and again when it runs', () => {
    const last = { web: fresh, android: fresh, ios: { ...fresh, at: '2026-11-03T03:00:00Z' } };
    const a = watch(last, emptyState(), { now, env });
    expect(a.messages).toHaveLength(1);
    expect(a.messages[0].text).toContain('iOS last finished run 52 h ago (expected every 24 h)');
    expect(watch(last, a.state, { now, env }).messages).toHaveLength(0);
    const b = watch({ ...last, ios: fresh }, a.state, { now, env });
    expect(b.messages[0].text).toContain('monitor running again');
  });

  it('heartbeat lists the three platforms and the owner', () => {
    const { messages } = watch({ web: fresh, android: fresh, ios: { ...fresh, failing: ['submit'] } }, emptyState(), { now, heartbeat: true, env: { ...env, SDK_MONITOR_OWNER: '<@U1>' } });
    const text = messages.at(-1).blocks[0].text.text;
    expect(text).toContain('Popup SDK monitor NOT OK');
    expect(text).toContain('Web 1 ✓ 06:30 UTC');
    expect(text).toContain('iOS 1 :x: submit');
    expect(text).toContain('owner <@U1>');
  });
});
