# Popup SDK monitoring and recovery (DD-26)

Synthetic monitoring of the popup SDK on Web, Android and iOS: what runs, where the alerts go,
what to do when one arrives, and how to roll back or mitigate a bad release. The same file lives
in `deepdots-popup-sdk` and `deepdots-popup-mobile-native-sdk`; change it in both.

**Owner:** Sergi Arias. The owner checks #notifications every working morning: the heartbeat
must be there and green (see [Missing heartbeat](#missing-heartbeat)).

## Synthetic, not customer monitoring

This checks **our internal test apps** with the **published** SDK (npm `latest`, the latest
Maven Central / DeepdotsSDK-SPM release) against the **DEV** API, with test companies only. It
tells us that the released SDK, the CDN/package registries, the popup API and the survey frontend
work together. It does **not** see customer apps: their SDK version, their configuration, their
devices. A green monitor does not prove a customer integration works, and a customer incident
can happen with the monitor green.

## What runs

| Platform | Workflow | Runner | Default frequency | SDK under test |
|---|---|---|---|---|
| Web | `deepdots-popup-sdk` · `.github/workflows/monitor.yml` · job `Web` | ubuntu, Chromium | every 1 h (cron `:17`) | npm `latest`, loaded from jsDelivr by the test store `apps/test-app` |
| Android | `deepdots-popup-mobile-native-sdk` · `.github/workflows/monitor.yml` · job `Android` | ubuntu, emulator API 34 | every 6 h | latest release on Maven Central |
| iOS | same workflow · job `iOS` | macos-15, iPhone 16 simulator | once a day | latest DeepdotsSDK-SPM release |

Four scenarios on each platform, named the same everywhere:

| Scenario | What it proves | Failure category |
|---|---|---|
| `init` | the published SDK loads, reports its version and gets the popup config from DEV | `init` |
| `trigger-render` | a trigger opens the popup and the survey renders in it | `render` |
| `submit` | the survey can be answered to the end and the answer reaches DEV | `submission` |
| `popups-error` | the popup API fails: no popup, and the host app keeps working | `host_safety` |

A failing scenario is retried once in the same run (Playwright `retries: 1`, `run-maestro.sh`);
it only counts when the retry fails too. A job that breaks before any scenario runs (emulator
does not boot, runner problem) is reported once as `monitor_error`: the monitor broke, not the SDK.

Frequencies are repository variables, so they change without a code change:
`SDK_MONITOR_EVERY_H_WEB` (web repo), `SDK_MONITOR_EVERY_H_ANDROID`, `SDK_MONITOR_EVERY_H_IOS`
(native repo). The cron runs hourly and skips the hours that are not due. Scheduled runs only
happen from the default branch (`main`); GitHub disables schedules after 60 days without
repository activity.

## Alerts (Slack #notifications)

Sent by the workflows themselves (`scripts/release/sdk-monitor.mjs`, same file in both repos)
through the secret `MONITORING_SLACK_WEBHOOK_URL` (the "Survey Monitoring" Slack app, the same
channel as the survey monitors). **Grafana is not in the path**: if Grafana or BigQuery is down,
alerts still arrive.

| Message | When |
|---|---|
| `🔴 Popup SDK · <platform> · <version> (<source> latest) · dev · <scenario> failed (<category>): <cause>` + screenshot · report · run · evidence · runbook | a confirmed failure |
| the same with _(still, since HH:MM UTC)_ | an open incident, at most every `SDK_MONITOR_REMINDER_H` (default 6 h) |
| `✅ Popup SDK recovered: … passes again (was <category> since HH:MM UTC, <duration>)` | the first passing run after an incident |
| `💚 Popup SDK monitor OK · Web … ✓ · Android … ✓ · iOS … ✓ · owner …` (`💔 NOT OK` if not) | daily heartbeat, at `SDK_MONITOR_HEARTBEAT_HOUR` UTC (default 8), sent by the web repo's `Watch` job |
| `🟡 Popup SDK monitor silent: <platform> last finished run N h ago` | a platform with no finished scheduled run in 2× its interval + 1 h |
| `🟠 … monitor_error … — not an SDK failure` | the job broke before the scenarios ran (told once) |

Manual runs (Run workflow) prefix every message with `TEST —` and keep their incidents apart from
the scheduled ones, so a failure test never opens or closes a real incident.

The **failure report** linked from the alert (GitHub Pages, `/validation/monitor/<platform>-<run>/`)
has the platform, SDK version, environment, failed scenario, timestamp, injected fault (if any),
the error, the screenshot (web also video and Playwright trace), the last SDK events and network
requests (web) or `[lab]` log lines (native), the other scenarios of the run and the first steps
below. Pages takes a minute or two to deploy after the alert; the run's artifact has the same files.

## Grafana

Each run writes one row per scenario to BigQuery `magicfeedback-c6458-dev.survey_monitoring.sdk_check_results`,
shown in the *Popup SDK* row of the [Survey Collection operations dashboard](https://dash.deepdots.com/d/survey-ops)
(definition in `MagicSurvey/monitoring/grafana/`). The write is optional: without the
`SDK_MONITOR_*` repository variables, or if it fails, the run and its alerts are unaffected.

## When an alert arrives

1. **Open the report or the run.** The screenshot and the SDK events usually say which step broke
   (popup not shown, survey not rendered, answer rejected).
2. **SDK, or the rest?** Look at #notifications for the survey monitors at the same time, and run
   this workflow by hand with the **previous** SDK version (`version` input on web; the native
   repo's `version` input). Same failure on the previous version → the API, the survey frontend or
   DEV data, not the release. Only the new version fails → a regression in the release: go on.
3. **Web regression:** [roll back](#web-roll-back-the-hosted-sdk), then fix and release.
4. **Native regression:** [mitigate](#native-mitigate-and-update-customers), then fix and release.
5. **`monitor_error` or silent:** fix the monitor (runner, emulator, quota); no customer impact
   implied.

## Web: roll back the hosted SDK

Customers load the web SDK in two ways, and only one of them can be rolled back by us:

- **From the CDN without a fixed version** (`cdn.jsdelivr.net/npm/@magicfeedback/popup-sdk` or
  `@latest`): follows the npm `latest` dist-tag. **We can roll this back.**
- **Bundled from npm at a fixed version**, or a CDN URL with an exact version: stays on that
  version until the customer updates. We can only tell them which version to use.

Roll back (`X.Y.Z` = the last good version):

```bash
npm dist-tag add @magicfeedback/popup-sdk@X.Y.Z latest   # needs an npm token with publish rights (.npm.env)
npm deprecate @magicfeedback/popup-sdk@<bad> "Broken: use X.Y.Z"
curl -s https://purge.jsdelivr.net/npm/@magicfeedback/popup-sdk@latest
curl -s https://purge.jsdelivr.net/npm/@magicfeedback/popup-sdk
```

Do not `npm unpublish`: npm only allows it in narrow cases, and it breaks customers' lockfiles. Then run this workflow
by hand: the summary shows which version `latest` resolves to. Fix forward with the normal release
(`npm run release:prepare` → PR → `npm run release:tag`); `latest` moves to the fix.

## Native: mitigate and update customers

A native SDK release is **compiled into the customer's app**. We cannot change it in the field:
Maven Central and DeepdotsSDK-SPM releases are immutable, and an app store update is the
customer's release. What we can do:

1. **Stop the popup server-side.** The SDK gets its popups from the API at every start
   (`GET /sdk/{publicKey}/popups`). Disable the affected popup (or its survey) in the Admin Panel
   for the customer's company: from the next app start no popup is shown, whatever SDK version
   the app has. This is the only immediate mitigation.
2. **Release a patch** (`X.Y.Z+1`) with the fix through the normal release flow.
3. **Tell the customer** the minimum version and that they need an app update; until their
   update is live, keep the popup disabled. Swift Package Manager users on "up to next minor"
   get the patch on their next package update; Gradle users must change the version.
4. Add the new version to `test-apps/sdk-versions.json` (the release PR checklist).

## Missing heartbeat

A monitor that stops running sends no alert by itself. Two signals cover it:

- the daily heartbeat in #notifications lists the last run of each platform;
- the `Watch` job (hourly, web repo) sends *Popup SDK monitor silent* when a platform has no
  finished scheduled run in 2× its interval + 1 h, and *running again* when it comes back.

If the heartbeat did not arrive at all, the web workflow itself is not running: open its runs on
GitHub. Causes seen or possible: schedule disabled after 60 days without activity (re-enable it on
the workflow page), the workflow file not on `main`, Actions quota, a broken step before the
alerts.

## Failure test

The ticket's mandatory test, repeatable at any time from **Run workflow** (TEST messages):

1. **Synthetic failure with Grafana unreachable:** web `inject_failure = survey406` and
   `simulate_grafana_down = true` (the runner cannot reach `dash.deepdots.com` and writes nothing
   to BigQuery). Native: `inject_failure = true` (the trigger scenario uses a popup config whose
   API answers 406, so no popup shows). Expect the TEST failure alert with the report.
2. Run again without injection: expect the TEST recovery.
3. Native regression: run the native workflow with `version` = a release with a known bug, then
   apply [the mitigation](#native-mitigate-and-update-customers) to its DEV popup config and run
   again.

## Diagnostics in customer environments (evaluation)

Not part of this monitor. What exists today, opt-in and without personal data beyond what the
customer already sends:

- Web: with analytics configured (`init({ analytics })`) and tracking on, the SDK sends
  `deepdots_survey_error` (`survey_id`, `popup_id`, `reason`, `message`) when a survey page cannot
  be sent, and hosts can listen to `survey_error`.
- Hosts can turn on `debug` to see the SDK's own logs in their console.

Proposed next step (needs a decision): an `init` option that sends only SDK error events
(popup config failed, survey failed to load, render error) with the SDK version and platform,
no user id, no answers, off by default, to a dedicated integration; that would give a
customer-side error rate per SDK version next to this synthetic monitor.

## Configuration

| Where | Name | Value |
|---|---|---|
| both repos, secret | `MONITORING_SLACK_WEBHOOK_URL` | webhook of the "Survey Monitoring" app (#notifications) |
| both repos, variable | `SDK_MONITOR_OWNER` | Slack mention of the owner, e.g. `<@U…>` (default: the name) |
| both repos, variable | `SDK_MONITOR_REMINDER_H` | reminder interval of an open incident (default 6) |
| web repo, variable | `SDK_MONITOR_EVERY_H_WEB`, `SDK_MONITOR_HEARTBEAT_HOUR` | 1, 8 |
| both repos, variable | `SDK_MONITOR_EVERY_H_ANDROID`, `SDK_MONITOR_EVERY_H_IOS` | 6, 24 (the web repo reads them for the watchdog) |
| both repos, variables | `SDK_MONITOR_WIF_PROVIDER`, `SDK_MONITOR_SERVICE_ACCOUNT`, `SDK_MONITOR_GCP_PROJECT`, `SDK_MONITOR_BQ_TABLE` | BigQuery write (optional) |
