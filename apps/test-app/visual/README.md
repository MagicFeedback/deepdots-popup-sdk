# Visual regression · popup web (DD-28)

Detects unexpected changes in how the popup looks. The test app opens the popup with fixed
content (popups and surveys from the service-worker fixtures, answers handled locally: nothing
goes to DEV), takes one screenshot per state and device, and compares each with its **approved**
baseline. The check fails on any difference; nothing ever approves a baseline automatically.

| | |
|---|---|
| Check (CI) | **`Visual regression · SDK local`** (`.github/workflows/visual.yml`): PRs to dev/main, every push to dev (so the tagged release commit), Mondays 06:30 UTC, manual with any published version |
| Capture | `popup.visual.ts` + `playwright.config.ts` (Playwright, Chromium) |
| Compare | `scripts/visual/check.mjs` (pixelmatch, same script as the native SDK repo) |
| Approve | `scripts/visual/approve.mjs` (by hand only; refuses to run in CI) |
| Baselines | `baselines/<device>/<state>.png` + `approvals.json` |
| Tolerance | `visual.json` |

## States and devices

Devices (Playwright projects, the name is the baselines folder): `web-desktop` (1280×860),
`web-mobile-small` (375×667 @2x, touch: iPhone SE width) and `web-mobile-pixel7` (412×839 @2.625x, touch).

| State | Survey / position | What it protects |
|---|---|---|
| `complex-1-open` | complex, `center` (overlay) | overlay, card size and position, typography, title, close button, primary button |
| `complex-1-required-error` | idem, Send without answer | required-question notice, footer |
| `complex-2-selected` | page 2: 4 stars + a checkbox | selected states, tallest page (clipping / scroll on small screens), Back button |
| `complex-3-boolean-email` | page 3 | resize between questions (shorter page), input fields |
| `complex-4-text` | page 4, text typed | textarea, counter |
| `complex-5-thanks` | thank-you | completion screen, "Completar encuesta" |
| `simple-1-bottom-right` | simple (NPS), `bottom-right`, no overlay | corner anchoring, NPS scale |
| `simple-2-text` | page 2 after NPS 9 (auto-advance) | resize between questions in a corner popup |
| `simple-1-top`, `simple-1-bottom-left` | `pos=` override | positioning |

Hidden in every screenshot: the Lab toolbar and panel (SDK version, run id, log: not part of the
host nor of the popup). The host's own CSS is `clean`: CSS leaks from the host are covered by the
functional regression (`e2e/regression/host-safety.spec.ts`), not here.

## Run it

```bash
npm run build
TEST_APP_PORT=5191 npm run test-app:visual
```

`test-app:visual` runs inside `mcr.microsoft.com/playwright:v<version>-noble` (the same image as
CI, `linux/amd64`; emulated on Apple Silicon). Outside it, fonts rasterise differently and every
screenshot would differ. Evidence in `out/report/`: `report.html` (reference · current · difference
per state), `results.json`, `summary.md`, `candidates/` (+ `meta.json`: SDK version, platform,
devices). Any published version: `SDK_VERSION=1.18.0 npm run test-app:visual`.

## Tolerance

`threshold 0.01` (per-pixel colour distance, antialiasing pixels ignored) and `maxDiffPixels 0`,
any size change fails. Measured on 4-nov-2026: 5 consecutive runs in the Docker image gave
byte-identical PNGs (120 comparisons, 0 px), so no tolerance is needed. If a device ever gets
noisy, raise its own `maxDiffPixels` in `visual.json` (`devices.<device>.compare`) with the
measurement that justifies it, never the global one.

## Approving baselines

A baseline only changes through a PR that a person reviews:

1. The check fails; open `report.html` from the `visual-report-local` artifact.
2. If the new look is intended, from a branch:
   ```bash
   npm run visual:approve -- --run <CI run id> --reason "why the new look is correct"
   ```
   (`--only web-desktop/complex-1-open` to approve some states, `--remove <key>` for a state
   that no longer exists, `--from <dir>` for local candidates.) It downloads the CI candidates,
   copies them into `baselines/` and appends to `approvals.json` who approved, when, why, from
   which run/SDK version, and the sha256 of each file (plus the previous one).
3. Commit and open a PR: GitHub shows the image diffs. Until it is merged the check keeps
   comparing against the old baselines.

`check.mjs` also fails when a baseline PNG does not match its approved sha256 (`unapproved_baseline`),
when a state has no baseline (`missing_baseline`) and when a baseline has no screenshot
(`missing_actual`): a baseline cannot change, appear or disappear silently.
