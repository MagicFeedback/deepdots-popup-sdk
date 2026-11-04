#!/usr/bin/env node
/**
 * Synthetic monitor of the popup SDK (DD-26, formerly MF-3200): the published SDK (`latest`) in
 * the internal test apps against the DEV API, on a schedule. This script turns the results of one
 * run into Slack messages (#notifications), a failure report and BigQuery rows. Grafana only
 * reads those rows: alerts never depend on it.
 *
 *   sdk-monitor.mjs collect --platform web|android|ios --sdk X.Y.Z --source npm|maven|spm --out DIR
 *       (--playwright results.json | --maestro DIR) [--job-status success|failure|cancelled] [--fault F]
 *     One row per scenario in DIR/results.jsonl (also the BigQuery rows). No results at all
 *     (the job broke first) = one `monitor_error` row.
 *   sdk-monitor.mjs report --out DIR --state state.json [--report-url URL]
 *     Decides what to tell Slack from the rows and the incidents still open (state.json):
 *     a confirmed failure alerts at once (the runner already retried it once), an open one is
 *     reminded every SDK_MONITOR_REMINDER_H (default 6) and a scenario that passes again is a
 *     recovery. With failures it writes the HTML report in DIR/report/ (published by the workflow
 *     at --report-url).
 *   sdk-monitor.mjs watch --state state.json [--heartbeat]
 *     Heartbeat and watchdog for the three platforms, from the last runs of both repos' monitor
 *     workflows (GitHub API, public repos): a platform with no finished run in 2× its interval
 *     + 1 h is "silent" (told once, and again when it runs).
 *
 * Environment: MONITORING_SLACK_WEBHOOK_URL (unset = print only), SDK_MONITOR_OWNER (Slack
 * mention of the owner, e.g. <@U123>), SDK_MONITOR_EVERY_H_{WEB,ANDROID,IOS}, SDK_MONITOR_REMINDER_H,
 * GITHUB_* (in Actions). A manual run (workflow_dispatch) prefixes every message with "TEST —".
 *
 * Same file in deepdots-popup-sdk and deepdots-popup-mobile-native-sdk: change it in both.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLATFORMS = {
  web: { label: 'Web', repo: 'MagicFeedback/deepdots-popup-sdk', job: 'Web', everyH: 1 },
  android: { label: 'Android', repo: 'MagicFeedback/deepdots-popup-mobile-native-sdk', job: 'Android', everyH: 6 },
  ios: { label: 'iOS', repo: 'MagicFeedback/deepdots-popup-mobile-native-sdk', job: 'iOS', everyH: 24 },
};

/** The same four scenarios on every platform; `category` is what a failure of each means. */
export const SCENARIOS = {
  init: { name: 'SDK init + version', category: 'init' },
  'trigger-render': { name: 'trigger → render', category: 'render' },
  submit: { name: 'answer → submit', category: 'submission' },
  'popups-error': { name: 'popups-error → no popup, host usable', category: 'host_safety' },
  monitor: { name: 'monitor run', category: 'monitor_error' },
};

export const ENVIRONMENT = { id: 'dev', url: 'https://api-dev.deepdots.com' };
const DASHBOARD = 'https://dash.deepdots.com/d/survey-ops';
const RUNBOOK = {
  web: 'https://github.com/MagicFeedback/deepdots-popup-sdk/blob/dev/docs/MONITORING.md',
  android: 'https://github.com/MagicFeedback/deepdots-popup-mobile-native-sdk/blob/dev/docs/MONITORING.md',
  ios: 'https://github.com/MagicFeedback/deepdots-popup-mobile-native-sdk/blob/dev/docs/MONITORING.md',
};

const ANSI = /\x1b\[[0-9;]*m/g;
const clip = (s, n = 160) => {
  const t = String(s ?? '').replace(ANSI, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const hhmm = (iso) => `${iso.slice(11, 16)} UTC`;
const slackEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ collect

/** Scenario id of a test: titles and flow names start with it (`submit · …`, `monitor-submit`). */
export function scenarioOf(title) {
  const id = String(title).replace(/^monitor-/, '').split(' · ')[0].trim();
  return SCENARIOS[id] ? id : null;
}

/** First line of a Playwright error, plus what it was waiting for (the call log names the locator). */
export function playwrightMessage(raw) {
  const text = String(raw ?? '').replace(ANSI, '');
  const first = text.split('\n')[0].trim();
  const waiting = text.match(/waiting for (.+)/)?.[1]?.trim();
  return clip(waiting && !first.includes(waiting) ? `${first} (waiting for ${waiting})` : first, 400);
}

/** Playwright results.json → one check per monitor test. */
export function fromPlaywright(results) {
  const checks = [];
  const walk = (suite) => {
    (suite.suites ?? []).forEach(walk);
    for (const spec of suite.specs ?? []) {
      const scenario = scenarioOf(spec.title);
      if (!scenario) continue;
      for (const t of spec.tests) {
        const runs = t.results ?? [];
        const last = runs.at(-1);
        const err = [...runs].reverse().find((r) => r.error || r.errors?.length);
        checks.push({
          scenario,
          status: t.status === 'expected' || t.status === 'flaky' ? 'pass' : t.status === 'skipped' ? 'skip' : 'fail',
          retried: runs.length > 1 && runs[0].status !== 'passed',
          started: runs[0]?.startTime ?? null,
          duration_ms: runs.reduce((s, r) => s + (r.duration ?? 0), 0),
          message: err ? playwrightMessage(err.error?.message ?? err.errors?.[0]?.message) : null,
          evidence: (last?.attachments ?? []).filter((a) => a.path).map((a) => ({ name: a.name, path: a.path })),
          // The monitor spec attaches what the SDK and the network did (`sdk-events`, inline body).
          sdk_log: (() => {
            const body = (last?.attachments ?? []).find((a) => a.name === 'sdk-events')?.body;
            return body ? Buffer.from(body, 'base64').toString('utf8').split('\n').slice(-40).join('\n') : null;
          })(),
        });
      }
    }
  };
  (results.suites ?? []).forEach(walk);
  return checks;
}

/** run-maestro.sh output (junit/<flow>.xml, maestro/<flow>.txt, maestro/<flow>.try1.txt) → checks. */
export function fromMaestro(dir) {
  const junit = join(dir, 'junit');
  if (!existsSync(junit)) return [];
  const checks = [];
  for (const file of readdirSync(junit).filter((f) => f.endsWith('.xml')).sort()) {
    const flow = basename(file, '.xml');
    const scenario = scenarioOf(flow);
    if (!scenario) continue;
    const xml = readFileSync(join(junit, file), 'utf8');
    const failed = /<(failure|error)\b/.test(xml);
    const skipped = /<skipped\b/.test(xml);
    const attr = (re) => xml.match(re)?.[1]?.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const out = join(dir, 'maestro', flow);
    const txt = join(dir, 'maestro', `${flow}.txt`);
    const failedLine = existsSync(txt) ? readFileSync(txt, 'utf8').split('\n').find((l) => l.startsWith('[Failed]')) : null;
    const evidence = existsSync(out)
      ? readdirSync(out, { recursive: true })
          .map(String)
          .filter((f) => /\.(png|mp4)$/.test(f))
          .map((f) => ({ name: basename(f), path: join(out, f) }))
      : [];
    const video = join(dir, 'videos', `${flow}.mp4`);
    if (existsSync(video)) evidence.push({ name: `${flow}.mp4`, path: video });
    checks.push({
      scenario,
      status: failed ? 'fail' : skipped ? 'skip' : 'pass',
      retried: existsSync(join(dir, 'maestro', `${flow}.try1.txt`)),
      started: existsSync(txt) ? statSync(txt).mtime.toISOString() : null,
      duration_ms: Math.round(Number(xml.match(/<testcase[^>]*\btime="([\d.]+)"/)?.[1] ?? 0) * 1000),
      message: failed ? clip(failedLine ?? attr(/<(?:failure|error)[^>]*message="([^"]*)"/) ?? 'flow failed', 400) : null,
      evidence,
    });
  }
  return checks;
}

/** Checks → BigQuery rows (survey_monitoring.sdk_check_results, schema in MagicSurvey). */
export function toRows(checks, { platform, sdk, source, requested = 'latest', fault = '', jobStatus = 'success', env = process.env, now = new Date() }) {
  const runId = `${env.GITHUB_RUN_ID ?? 'local'}-${env.GITHUB_RUN_ATTEMPT ?? 1}`;
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const list = checks.filter((c) => c.status !== 'skip');
  if (!list.length) {
    list.push({
      scenario: 'monitor',
      status: 'fail',
      retried: false,
      started: now.toISOString(),
      duration_ms: 0,
      message: `no test results: the ${PLATFORMS[platform].label} job ended ${jobStatus} before the scenarios ran`,
      evidence: [],
    });
  }
  return list.map((c) => ({
    schema_version: 1,
    run_id: runId,
    check_id: `${runId}/${platform}/${c.scenario}`,
    timestamp: c.started ?? now.toISOString(),
    duration_ms: c.duration_ms ?? 0,
    platform,
    scenario: c.scenario,
    scenario_name: SCENARIOS[c.scenario].name,
    sdk_requested: requested,
    sdk_version: sdk || null,
    sdk_source: source,
    environment: ENVIRONMENT.id,
    environment_url: ENVIRONMENT.url,
    status: c.status,
    retried: c.retried,
    failure_category: c.status === 'fail' ? SCENARIOS[c.scenario].category : null,
    message: c.message,
    injected_fault: fault || null,
    evidence: c.evidence ?? [],
    trigger: env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : env.GITHUB_EVENT_NAME ? 'manual' : 'local',
    run_url: runUrl,
    repo: env.GITHUB_REPOSITORY ?? null,
    commit: env.GITHUB_SHA ?? null,
  }));
}

// ------------------------------------------------------------------ report

export const emptyState = () => ({ version: 1, incidents: {}, silent: {} });
const key = (r) => `${r.platform}/${r.scenario}`;

/**
 * This run's rows + the incidents still open → what to tell Slack. The runner already retried
 * each failure once (Playwright `retries: 1`, run-maestro.sh), so a `fail` row is confirmed.
 * A `monitor_error` (the job broke, not the SDK) is told once, like a DEV failure in the
 * survey monitors; real failures are reminded every SDK_MONITOR_REMINDER_H.
 */
export function decide(rows, previous, now = new Date(), env = process.env) {
  const reminderMs = (Number(env.SDK_MONITOR_REMINDER_H) || 6) * 3_600_000;
  const state = { ...emptyState(), ...previous, incidents: { ...previous.incidents } };
  const alert = [];
  const recovered = [];
  const ran = new Set(rows.map((r) => r.platform));
  for (const r of rows) {
    const open = state.incidents[key(r)];
    if (r.status === 'fail') {
      const reminder = r.failure_category !== 'monitor_error' && now - Date.parse(open?.last_alert ?? 0) >= reminderMs;
      const due = !open || reminder || open.category !== r.failure_category;
      if (due) alert.push({ row: r, since: open?.since ?? null });
      state.incidents[key(r)] = {
        platform: r.platform,
        scenario: r.scenario,
        category: r.failure_category,
        message: r.message,
        since: open?.since ?? r.timestamp,
        last_alert: due ? now.toISOString() : open.last_alert,
      };
    } else if (open) {
      recovered.push({ incident: open, row: r });
      delete state.incidents[key(r)];
    }
  }
  // A platform that ran now with no `monitor` row closes its monitor_error incident.
  for (const [k, inc] of Object.entries(state.incidents)) {
    if (inc.scenario === 'monitor' && ran.has(inc.platform) && !rows.some((r) => key(r) === k)) {
      recovered.push({ incident: inc, row: rows.find((r) => r.platform === inc.platform) });
      delete state.incidents[k];
    }
  }
  return { alert, recovered, state };
}

const testPrefix = (env) => (env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== 'schedule' ? 'TEST — ' : '');
const where = (r) => `${PLATFORMS[r.platform].label} · \`${r.sdk_version ?? '?'}\` (${r.sdk_source} ${r.sdk_requested}) · ${r.environment}`;
const lines = (first, ...rest) => ({
  text: first.replace(/ · <[^>]+>/g, ''),
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: [first, ...rest].join('\n') } }],
});

export function failureMessage({ row: r, since }, { reportUrl, env = process.env } = {}) {
  const what = r.failure_category === 'monitor_error' ? 'monitor_error' : `failed (${r.failure_category})`;
  const note = since ? ` _(still, since ${hhmm(since)})_` : '';
  const fault = r.injected_fault ? ` · injected fault \`${r.injected_fault}\`` : '';
  const icon = r.failure_category === 'monitor_error' ? ':large_orange_circle:' : ':red_circle:';
  const tail = r.failure_category === 'monitor_error' ? ' — not an SDK failure' : '';
  const first = `${icon} ${testPrefix(env)}*Popup SDK* · ${where(r)} · *${slackEscape(SCENARIOS[r.scenario].name)}* ${what}${note}${fault}: ${slackEscape(clip(r.message, 160))}${tail}`;
  const shot = r.evidence.find((e) => e.url && /\.png$/.test(e.path ?? e.name));
  const links = [
    shot ? `<${shot.url}|screenshot>` : null,
    reportUrl ? `<${reportUrl}|report>` : null,
    r.run_url ? `<${r.run_url}|run>` : null,
    r.run_url ? `<${r.run_url}#artifacts|evidence>` : null,
    `<${RUNBOOK[r.platform]}|runbook>`,
  ].filter(Boolean);
  return lines(first, links.join(' · '));
}

const ago = (ms) =>
  ms >= 36_000_000 ? `${Math.round(ms / 3_600_000)} h` : ms >= 3_600_000 ? `${Math.round(ms / 360_000) / 10} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;

export function recoveryMessage({ incident, row }, { now = new Date(), env = process.env } = {}) {
  const was = incident.category === 'monitor_error' ? 'monitor_error' : incident.category;
  return lines(
    `:white_check_mark: ${testPrefix(env)}*Popup SDK recovered*: ${where(row)} · ${slackEscape(SCENARIOS[incident.scenario].name)} passes again (was ${was} since ${hhmm(incident.since)}, ${ago(now - Date.parse(incident.since))})${row.run_url ? ` · <${row.run_url}|run>` : ''}`,
  );
}

/** Failure report (HTML through the release validation report's renderer): one section per failure. */
export function buildReport(rows, { platform, now = new Date() } = {}) {
  const failed = rows.filter((r) => r.status === 'fail');
  const p = PLATFORMS[platform].label;
  const md = [
    `# Popup SDK monitor · ${p} · FAIL`,
    '',
    `Synthetic check of the published SDK in the internal test app against DEV. Generated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC from the run's real results.`,
    '',
  ];
  for (const r of failed) {
    md.push(
      `## ${SCENARIOS[r.scenario].name} · ${r.failure_category}`,
      '',
      '| | |',
      '|---|---|',
      `| Platform | ${p} |`,
      `| SDK version | ${r.sdk_version ?? '?'} (${r.sdk_source} \`${r.sdk_requested}\`) |`,
      `| Environment | DEV · ${r.environment_url} |`,
      `| Failed scenario | ${SCENARIOS[r.scenario].name} (\`${r.scenario}\`) |`,
      `| Timestamp | ${r.timestamp} · failed on the retry too |`,
      `| Injected fault | ${r.injected_fault ?? 'none'} |`,
      '',
      '```',
      r.message ?? 'no message',
      '```',
      '',
    );
    for (const e of r.evidence.filter((x) => x.report)) {
      md.push(/\.png$/.test(e.name) ? `![${e.name}](${e.report})` : `[${e.name}](${e.report})`, '');
    }
    if (r.sdk_log) md.push('**SDK events and network**', '', '```', r.sdk_log, '```', '');
  }
  md.push('## Other checks in this run', '', '| Scenario | Result |', '|---|---|');
  for (const r of rows) md.push(`| ${SCENARIOS[r.scenario].name} | ${r.status === 'fail' ? '**FAIL**' : r.retried ? 'PASS (on retry)' : 'PASS'} |`);
  md.push(
    '',
    '## What to do',
    '',
    '1. SDK or backend? The same failure on the previous SDK version (run the workflow by hand with that version) or in the survey monitors points at the API or the survey frontend.',
    platform === 'web'
      ? '2. Only the latest SDK fails: move npm `latest` back to the previous version and purge jsDelivr (runbook), then ship a fix.'
      : '2. Only the latest SDK fails: a released binary cannot be pulled from customer apps. Disable the affected popup configs in Admin, ship a patch release and tell clients the minimum version (runbook).',
    '3. This is a synthetic check of our test app in DEV, not of customer apps.',
    '',
    `[Runbook](${RUNBOOK[platform]}) · [Run](${rows[0]?.run_url ?? '#'}) · [Dashboard](${DASHBOARD})`,
  );
  return md.join('\n');
}

// ------------------------------------------------------------------ watch (heartbeat + watchdog)

export const everyH = (platform, env = process.env) => Number(env[`SDK_MONITOR_EVERY_H_${platform.toUpperCase()}`]) || PLATFORMS[platform].everyH;

/**
 * last: {platform: {at, conclusion, sdk, failing}} from the GitHub API (null = no run in 7 days).
 * Silent = no finished run in 2× the interval + 1 h; told once, and again when it runs.
 */
export function watch(last, previous, { now = new Date(), heartbeat = false, env = process.env } = {}) {
  const state = { ...emptyState(), ...previous, silent: { ...previous.silent } };
  const messages = [];
  for (const platform of Object.keys(PLATFORMS)) {
    const l = last[platform];
    const limitMs = (2 * everyH(platform, env) + 1) * 3_600_000;
    const age = l ? now - Date.parse(l.at) : Infinity;
    if (age > limitMs && !state.silent[platform]) {
      state.silent[platform] = now.toISOString();
      messages.push(
        lines(
          `:large_yellow_circle: ${testPrefix(env)}*Popup SDK monitor silent*: ${PLATFORMS[platform].label} last finished run ${l ? `${ago(age)} ago` : 'over 7 days ago'} (expected every ${everyH(platform, env)} h) · <https://github.com/${PLATFORMS[platform].repo}/actions/workflows/monitor.yml|workflow runs> · <${RUNBOOK[platform]}#missing-heartbeat|runbook>`,
        ),
      );
    } else if (age <= limitMs && state.silent[platform]) {
      messages.push(lines(`:white_check_mark: ${testPrefix(env)}*Popup SDK monitor running again*: ${PLATFORMS[platform].label} (silent since ${hhmm(state.silent[platform])})`));
      delete state.silent[platform];
    }
  }
  if (heartbeat) {
    const parts = Object.keys(PLATFORMS).map((p) => {
      const l = last[p];
      if (!l) return `${PLATFORMS[p].label} no run`;
      const mark = l.failing?.length ? `:x: ${l.failing.join(', ')}` : l.conclusion === 'success' ? '✓' : `:x: ${l.conclusion}`;
      return `${PLATFORMS[p].label} ${l.sdk ?? '?'} ${mark} ${hhmm(l.at)}`;
    });
    const ok = Object.keys(PLATFORMS).every((p) => last[p] && !last[p].failing?.length && last[p].conclusion === 'success' && !state.silent[p]);
    const owner = env.SDK_MONITOR_OWNER || 'Sergi Arias';
    messages.push(
      lines(
        `${ok ? ':green_heart:' : ':broken_heart:'} ${testPrefix(env)}*Popup SDK monitor ${ok ? 'OK' : 'NOT OK'}* · ${parts.join(' · ')} · owner ${owner} · <${DASHBOARD}|dashboard>`,
      ),
    );
  }
  return { messages, state };
}

/** Last finished run of each platform's job, with the `sdk-monitor` notice the job leaves. */
async function lastRuns(env = process.env) {
  const headers = { Accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
  const get = async (path) => {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
    return res.json();
  };
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const out = {};
  for (const repo of new Set(Object.values(PLATFORMS).map((p) => p.repo))) {
    const { workflow_runs: runs } = await get(`/repos/${repo}/actions/workflows/monitor.yml/runs?event=schedule&status=completed&created=>=${since}&per_page=50`);
    for (const run of runs) {
      const { jobs } = await get(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=50`);
      for (const [platform, p] of Object.entries(PLATFORMS)) {
        if (p.repo !== repo || out[platform]) continue;
        const job = jobs.find((j) => j.name === p.job && j.conclusion && j.conclusion !== 'skipped');
        if (!job) continue;
        const notes = await get(`/repos/${repo}/check-runs/${job.id}/annotations`).catch(() => []);
        const note = notes.find((a) => a.title === 'sdk-monitor');
        const info = note ? JSON.parse(note.message) : {};
        out[platform] = { at: job.completed_at, conclusion: job.conclusion, sdk: info.sdk ?? null, failing: info.failing ?? [] };
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ CLI

async function post(message, env = process.env) {
  const outDir = env.SDK_MONITOR_OUT;
  if (outDir) {
    mkdirSync(join(outDir, 'slack'), { recursive: true });
    writeFileSync(join(outDir, 'slack', `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`), JSON.stringify(message, null, 2));
  }
  const webhook = env.MONITORING_SLACK_WEBHOOK_URL;
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `- Slack${webhook ? '' : ' (not sent, no webhook)'}: ${message.blocks[0].text.text.replace(/\n/g, ' ')}\n`);
  if (!webhook) {
    console.log(`::warning::No MONITORING_SLACK_WEBHOOK_URL: Slack message printed only`);
    console.log(message.blocks[0].text.text);
    return;
  }
  const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...message, unfurl_links: false, unfurl_media: false }) });
  // The URL is the secret: never print it.
  if (!res.ok) console.log(`::warning::Slack answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  else console.log(`[sdk-monitor] sent: ${message.text}`);
}

const readJson = (file, fallback) => (file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const readRows = (out) =>
  existsSync(join(out, 'results.jsonl'))
    ? readFileSync(join(out, 'results.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`[sdk-monitor] ${name}=${value}`);
}

function parse(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) a._.push(argv[i]);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) a[argv[i].slice(2)] = true;
    else a[argv[i].slice(2)] = argv[++i];
  }
  return a;
}

/** Last lines of the SDK's own log for the report: Playwright attachment or Maestro lab.log. */
function sdkLog(check, maestroDir) {
  if (check?.sdk_log) return check.sdk_log;
  const lab = maestroDir && join(maestroDir, 'lab.log');
  if (lab && existsSync(lab)) return readFileSync(lab, 'utf8').split('\n').slice(-40).join('\n');
  return null;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parse(rest);
  if (cmd === 'collect') {
    const checks = a.playwright ? (existsSync(a.playwright) ? fromPlaywright(readJson(a.playwright)) : []) : fromMaestro(a.maestro);
    const rows = toRows(checks, { platform: a.platform, sdk: a.sdk, source: a.source, fault: a.fault, jobStatus: a['job-status'] });
    rows.forEach((r, i) => (r.sdk_log = r.status === 'fail' ? sdkLog(checks.filter((c) => c.status !== 'skip')[i], a.maestro) : null));
    mkdirSync(a.out, { recursive: true });
    writeFileSync(join(a.out, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const failing = rows.filter((r) => r.status === 'fail').map((r) => r.scenario);
    // Read back by the heartbeat (check-run annotations of this job).
    console.log(`::notice title=sdk-monitor::${JSON.stringify({ platform: a.platform, sdk: a.sdk || null, failing })}`);
    for (const r of rows) console.log(`[sdk-monitor] ${r.platform} ${r.scenario}: ${r.status}${r.retried ? ' (retried)' : ''}${r.message ? ` · ${r.message}` : ''}`);
    output('failed', failing.length ? 'true' : 'false');
    return;
  }
  if (cmd === 'report') {
    process.env.SDK_MONITOR_OUT ??= a.out;
    const rows = readRows(a.out);
    const { alert, recovered, state } = decide(rows, readJson(a.state, emptyState()));
    const failed = rows.filter((r) => r.status === 'fail');
    if (failed.length) {
      const dir = join(a.out, 'report');
      mkdirSync(join(dir, 'files'), { recursive: true });
      for (const r of failed) {
        for (const e of r.evidence) {
          if (!existsSync(e.path) || !/\.(png|webm|mp4|zip)$/.test(e.path)) continue;
          const name = `${r.scenario}-${basename(e.path)}`;
          copyFileSync(e.path, join(dir, 'files', name));
          e.report = `files/${name}`;
          if (a['report-url']) e.url = `${a['report-url'].replace(/\/$/, '')}/files/${name}`;
        }
      }
      const { toHtml } = await import('./validation-report.mjs');
      writeFileSync(join(dir, 'index.html'), toHtml(buildReport(rows, { platform: rows[0].platform }), `Popup SDK monitor · ${rows[0].platform}`));
      writeFileSync(join(a.out, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    for (const v of alert) await post(failureMessage(v, { reportUrl: a['report-url'] }));
    for (const v of recovered) await post(recoveryMessage(v));
    if (!alert.length && !recovered.length) console.log(`[sdk-monitor] nothing to tell Slack (${rows.length} checks, ${failed.length} failing, ${Object.keys(state.incidents).length} open incidents)`);
    writeFileSync(a.state, JSON.stringify(state, null, 2));
    output('report', failed.length ? 'true' : 'false');
    return;
  }
  if (cmd === 'watch') {
    const last = await lastRuns();
    console.log(`[sdk-monitor] last runs: ${JSON.stringify(last)}`);
    const { messages, state } = watch(last, readJson(a.state, emptyState()), { heartbeat: a.heartbeat === true || a.heartbeat === 'true' });
    for (const m of messages) await post(m);
    writeFileSync(a.state, JSON.stringify(state, null, 2));
    return;
  }
  console.error('usage: sdk-monitor.mjs collect|report|watch … (see the header)');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
