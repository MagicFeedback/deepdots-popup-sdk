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
