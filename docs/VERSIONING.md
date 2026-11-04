# Versioning, releases and supported versions

`@magicfeedback/popup-sdk` is released on its own schedule. Its version has nothing to do
with the Survey Renderer (MagicSurvey, `vX.Y.Z` of the survey frontend) or with the native
popup SDK. Each release states the survey renderer it bundles (`@magicfeedback/native`) in its
compatibility manifest.

## Version numbers

[Semantic Versioning](https://semver.org/spec/v2.0.0.html), `MAJOR.MINOR.PATCH`:

| Bump  | When |
|-------|------|
| MAJOR | Something a host has to change: a removed or renamed option, method or event, a different meaning for an existing one, a host environment we stop supporting. |
| MINOR | New options, methods or events; a new bundled survey renderer with visible changes; new supported hosts. |
| PATCH | Fixes that keep the public API and behaviour hosts rely on. |

Prereleases (`X.Y.Z-beta.N`) go to the `next` dist-tag on npm and never move `latest`.

## What every release carries

Every version on npm has, and the publish workflow refuses to publish without:

1. **A version bump**, higher than anything already released on its `MAJOR.MINOR` line.
2. **Release notes**: its `## [X.Y.Z] — YYYY-MM-DD` section in [`CHANGELOG.md`](../CHANGELOG.md).
3. **A Git tag** `vX.Y.Z` on the release commit in `dev`.
4. **A valid compatibility manifest**, [`release/compatibility.json`](../release/compatibility.json)
   (schema: [`release/compatibility.schema.json`](../release/compatibility.schema.json)) with:
   - platform and SDK version (must equal `package.json` and the tag);
   - the bundled survey renderer and the one the React Native WebView loads from the CDN;
   - supported host environments: browsers (with which ones the E2E suite runs on) and
     frameworks (vanilla, React, Angular, React Native; React Native Web is not supported);
   - the configuration schema, [`release/config.schema.json`](../release/config.schema.json),
     generated from `src/types` (`init()` options and the popup definition the API sends);
   - known-good popup fixtures ([`release/fixtures/`](../release/fixtures)), validated against
     that schema and rendered by `src/core/release-fixtures.test.ts`;
   - known issues.
5. **One immutable artifact**: the tarball is packed once, smoke-tested (installed in an empty
   project, imported as ESM and CJS, files checked), and **that same file** is published.
   npm never lets a version be overwritten.
6. **Traceability**: the GitHub Release `vX.Y.Z` has the tarball, `SHA256SUMS`, the
   manifest, the config schema and `release.json`, which records the commit, the tarball's
   sha256 and npm integrity (checked against what npm stored), the CI run that passed on that
   commit, the release pull request with its approvals and who merged it, and who pushed the tag.

## Release gates

A version reaches npm only through `release.yml`, and only if every gate below is green.
`npm run release:tag` checks the same before it pushes the tag.

| Gate | Where | What blocks |
|---|---|---|
| Tests & build | every pull request and push to `dev` (`ci.yml`, required on `dev`) | a failing unit test, lint or build |
| E2E (Playwright) | same (required on `dev`) | a failing package e2e test |
| Version & changelog | every pull request (`release-check.yml`, required on `dev`) | missing release notes or bump, an invalid manifest, schema or fixtures; on the release pull request, the "Release dry run" packs and smoke-tests the tarball |
| Smoke + regression · SDK local | pull requests that touch the SDK or the test app, and every push to `dev` (`test-app.yml`) | any test store test failing with the build of that commit, desktop and mobile Chromium |
| Visual regression · SDK local | every pull request and push to `dev` (`visual.yml`, DD-28) | a screenshot that differs from its approved baseline, or a baseline that is missing or not approved |
| Release checks | `release.yml`, before anything is published | any of "Tests & build", "E2E (Playwright)", "Smoke + regression · SDK local" or "Visual regression · SDK local" not green **or missing** on the tagged commit |

The tarball is packed once; that file is smoke-tested, published and attached to the GitHub
Release, and its integrity is checked against what npm stored. The release validation report
(test status and known issues) is linked from the release notes.

Publishing from a laptop is disabled: `prepublishOnly` refuses, and the old `npm run release`
script is gone.

### Emergency exception

Use it only when a published version is causing harm in production and a required check cannot
go green in time for reasons unrelated to the change (for example, the DEV API the test store
uses is down).

1. Open the release pull request as usual (`npm run release:prepare`) and let the checks run.
2. Add a `## Release gate override` section to its description: what is failing, why it is not
   the change, what was checked by hand instead, and the follow-up.
3. A repository **admin** adds the `release-gate-override` label. A label added by anyone else
   is refused.
4. Merge and tag as usual. The release checks step lets the red checks through with a warning,
   and the GitHub Release notes start with **"Published with a release gate override"**: who
   approved it, the reason and the checks that were not green.
5. Remove the label, fix the failing check, and release a clean version afterwards.

Without both the section and an admin's label, a red or missing check blocks the release.

## How a release happens

```text
feature PR ──► dev            notes under "## [Unreleased]"          (Version & changelog)
npm run release:prepare -- patch|minor|major
release PR ──► dev            version bump + "## [X.Y.Z] — date"      (Version & changelog
                              + release/compatibility.json version     + Release dry run)
npm run release:tag           tag vX.Y.Z on dev
release.yml                   gate ─► pack ─► smoke ─► publish that tarball ─► GitHub Release ─► merge to main
                              └─► Slack notice in #sdk-releases (slack-notify.yml)
```

- A pull request to `dev` that changes the package (`src/`, the build config, published
  dependencies or the bundled survey renderer) must add release notes under `[Unreleased]`.
- Only the release pull request changes the version. Its "Release dry run" job runs the same
  gate as the publish workflow and packs and smoke-tests the tarball, so a broken release is
  caught before the tag exists.
- A pull request to `main` that changes the package is a hotfix and must bump the version and
  add its own changelog section.
- If the configuration types change, regenerate the schema with `npm run release:schema`.
- Run the pull request check locally with `npm run release:check`.
- Once the GitHub Release exists, `slack-notify.yml` posts the version, links and up to six
  changelog entries to #sdk-releases. The webhook is the `SDK_RELEASES_SLACK_WEBHOOK_URL`
  secret; without it the job only warns. Dry runs and releases that fail before publishing post
  nothing. To test it, run the workflow by hand ("Run workflow"): it posts the latest release
  with a "🧪 TEST" prefix.

## Supported versions

| Line | Support |
|------|---------|
| Latest minor of the current major (e.g. `1.17.x`) | Fixes and security fixes. Upgrade to the newest patch to get them. |
| Previous minor of the current major (e.g. `1.16.x`) | Security fixes and fixes for data loss (analytics or survey responses) for **3 months** after the next minor ships, as patches on its line (`npm i @magicfeedback/popup-sdk@release-1.16`). |
| Latest minor of the previous major | Security fixes for **6 months** after the new major ships. |
| Anything older | Not supported. Versions with a known data-loss or security bug are marked with `npm deprecate`, pointing to the fixed version. |

A patch for an older line is published under the dist-tag `release-MAJOR.MINOR`, never as
`latest`. The bundled survey renderer is supported as shipped: to get a newer renderer,
upgrade the popup SDK.
