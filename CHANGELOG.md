# Changelog

All notable changes to `@magicfeedback/popup-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] — 2026-07-30

### Added

- **Session end is now signalled.** The last batch of a session is sent with
  `completed: true`, closing the record on the backend, and carries a new
  `deepdots_session_end` event with the reason. Before this, every batch went out with
  `completed: false` and the backend had no way to tell which one was the last.

  The closing batch flushes everything still open, in order: the current screen's
  `deepdots_page_view`, any pending `deepdots_mini_service_exit`, the accumulated
  `deepdots_user_engagement`, and finally `deepdots_session_end`.

  Sessions close on: `pagehide` (web), `AppState → background` (React Native), a user
  change, `setTrackingEnabled(false)`, and the new `endSession()`. The `reason` parameter
  says which (`page_hide` / `background` / `user_change` / `tracking_disabled` / `manual`).

- **`endSession()`** — closes the session explicitly (logout, end of a flow).

- **`setUserId(userId?)`** — user change (login / logout / account switch). Closes the
  previous user's session with `reason: 'user_change'`, swaps the identity, and opens a new
  session. Called with no argument it reverts to the SDK's anonymous id. User attributes and
  metrics from the previous user are discarded.

- **`deepdots_session_start` is now emitted on every session open**, not just at `init()`:
  on returning to foreground, on `setTrackingEnabled(true)`, and after a user change. If
  you init with `trackingEnabled: false`, granting consent later now opens the first session
  (previously no `session_start` was ever emitted in that flow).

- New `SessionEndReason` type; `BuildBodyOptions` on `buildAnalyticsFeedbackBody`;
  `onSessionReset` on `FeedbackSinkOptions`; `sessionEnd` on `AnalyticsFlushMeta`;
  `AnalyticsManager.resetUserScope()`.

- **`MessageGuard` — protections for the `trackMessage()` funnel.** Three shapes that were
  impossible in reality but produced `CTR > 100%` in BigQuery are now rejected: a channel
  outside the whitelist, a repeated `(message_id, stage)` pair (idempotency), and a
  `message_id` that changes channel partway through the funnel.

  New exports: `MessageGuard`, `MESSAGE_CHANNELS`, `MAX_TRACKED_MESSAGES` and the types
  `MessageChannel`, `MessageGuardVerdict`, `MessageRejectionReason`.

### Changed

- **`init()` with a different `userId` is no longer a silent no-op.** It is now treated as a
  user change and delegates to `setUserId()`. Listeners, timers and the popup fetch are not
  re-run. An `init()` with the *same* `userId` still no-ops as before.

- **`onBackground()` now ends the session** (it used to only flush). In React Native,
  `setupReactNative` no longer routes `AppState`'s `inactive` to it: on iOS `inactive` is
  transient (incoming call, app switcher) and closing there would split one session in two.
  `inactive` flushes without closing; only `background` closes.

- After a session closes, the cached analytics `sessionId` is forgotten, so the next batch
  goes out **without** `sessionId` and the backend opens a new record.

`feedback.finished` remains `false` in all cases — `completed` is the only close signal.

### Fixed

- **Form controls were rendered dark on a light popup when the host page was in dark mode.**
  The popup sets its own `background` (`#fff` light / `#1e1e1e` dark) but did not declare
  `color-scheme`, so `input`/`textarea`/`select` fell back to the browser's default styling.
  In a host with `prefers-color-scheme: dark` — and a page that declares
  `<meta name="color-scheme" content="light dark">`, as any theme-aware app does — Chrome
  painted them dark grey with white text on the popup's white background.

  `.deepdots-popup` now declares `color-scheme` alongside its background, derived from
  `style.theme`, so light and dark popups both stay coherent regardless of the host's
  browser or OS preference.

### Backend requirement

`completed: true` must **close the record** for that `sessionId`; the next batch arrives
with no `sessionId` and must open a new record.

`completed: true` is **opportunistic, not a guarantee**: an app killed by the user or the OS,
a crash, or a lost connection produce no callback on any platform, so those records will
never receive it. **The backend still needs an inactivity window** to close them.

Note also that each background/foreground cycle on mobile now closes and opens a session. If
you want an immediate return to resume the previous session, the grace window has to be
applied backend-side (same `deepdots_user_id`, gap < N minutes → merge).

See `docs/ANALYTICS-BACKEND-SPEC.md` §7.

## [1.1.8] — 2026-07-29

### Fixed

- **React Native: `triggerEvent()` crashed on popups with language segmentation.**
  `matchesSegmentsLang` read `navigator.language` behind a guard that checked the
  `navigator` *object* but not the `language` *property*. React Native defines
  `navigator` (with `product: 'ReactNative'`) but no `language`, so the call threw
  `TypeError: Cannot read property 'toLowerCase' of undefined`.

  The throw happened inside `triggerEvent` → `shouldShow`, so it aborted the **entire
  event evaluation** — no popup was shown at all, not just the language-segmented one.
  Popup language segmentation now resolves through the same `resolveLanguage()` the SDK
  already used for the analytics context.

  If you patched `navigator.language` as a workaround, you can remove that patch.

- **React Native: language segmentation now works instead of being unavailable.**
  With no `navigator.language`, the SDK falls back to the `Intl` locale (available in
  Hermes), so `segments.lang` is evaluated correctly on device.

- **A non-string entry in `segments.lang` no longer throws.** A `null` returned by the
  backend inside the array triggered the same crash through a different path. Non-string
  entries are now skipped.

### Added

- **Delivery reliability for the analytics channel** (`POST /sdk/feedback`), addressing
  reports of events not arriving:
  - `keepalive` on the `fetch` (for bodies ≤ 60KB), and `navigator.sendBeacon` for the
    final flush on `pagehide`. The browser no longer cancels the last batch — the one
    carrying the closing `page_view` and `user_engagement`.
  - **Retry on transient failures.** A rejected batch is put back at the front of the
    buffer (preserving chronological order) and retried on the next flush. Capped by
    `maxBufferedEvents` (default 200; oldest events are dropped past the cap).
  - **Visible, classified errors.** 5xx / 408 / 429 are retried; 4xx (e.g. 406 Contact)
    are logged with status and response body (first 500 chars) and dropped. Previously a
    non-2xx response was silently ignored.
  - **First batch is serialized.** Until the `sessionId` is known, a second batch waits
    for the first response. Two parallel POSTs without a `sessionId` created two records
    and split the session's data. The final flush does not wait.

### Changed

- **`init({ language })` now also drives popup language segmentation.** The option
  already existed in 1.1.7 but only fed the analytics context. If you pass a value that
  differs from the browser's actual language, it now affects which popups are shown.
  Resolution order is unchanged: explicit `language` → `navigator.language` → `Intl`
  locale. When no source resolves a language, popups with `segments.lang` cannot be
  filtered and are shown.

- `flushAnalytics()` accepts an optional `{ final?: boolean }`. Passing `final: true`
  switches the transport to `sendBeacon`. Existing calls are unaffected.

- The `AnalyticsSink` type accepts an optional `meta` argument and may return
  `Promise<void>`. This is a widening — existing sink implementations still satisfy it.
  Rejecting the returned promise is what triggers the retry described above.

- New `AnalyticsFlushMeta` type; new `maxBufferedEvents` option on `AnalyticsManager`;
  new injectable `sendBeaconImpl` on `FeedbackSinkOptions`.

There are no breaking changes and no additions or removals in the package's exports.

### Backend requirement

Delivery is now **at-least-once**: a batch that fails after the backend has already
processed it will be sent again. **The backend must deduplicate on
`(deepdots_user_id, event name, timestamp)`**, which uniquely identifies an event.

Two consequences of the `sendBeacon` final flush: that batch cannot read the response,
so its `sessionId` is discarded and the backend must stitch by `deepdots_user_id`.

See `docs/ANALYTICS-BACKEND-SPEC.md` §6.

### Not included

Kotlin Multiplatform parity for the delivery-reliability work. The KMP SDK is unaffected
by the language crash (it does not use `navigator`), but its analytics sink still has no
retry or error classification.

## Earlier versions

Releases before 1.1.8 are not documented here. This changelog starts at 1.1.8; for
earlier history see the git log.

[1.1.8]: https://github.com/MagicFeedback/deepdots-popup-sdk/compare/c134e09...29ad9ea
