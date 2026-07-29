# Changelog

All notable changes to `@magicfeedback/popup-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
