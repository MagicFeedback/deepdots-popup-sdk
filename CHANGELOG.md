# Changelog

All notable changes to `@magicfeedback/popup-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.21.0] — 2026-11-13

Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.1–3.6.0); bundled: 2.2.39.

### Changed
- **React Native: coming back from the background within 5 minutes is the same session.** Going to the background used to close the session, so leaving to sign in in another app and coming back, or checking a notification, counted as two sessions. On a production app about a third of all sessions were a return within 2 minutes. `onBackground` now suspends the session (it sends what is pending with a `deepdots_session_suspend`, `reason: background`, and no `completed`) and `onForeground` resumes it with `deepdots_session_resume` when the app is back within `ANALYTICS_BACKGROUND_RESUME_WINDOW_MS` (5 min). Later, a new session starts as before (`foreground`), and the backend closes the old one with a `session_end` `background` at the time the app left. The suspend batch is stored before it is sent and resent on the next launch if the OS kills the app, like the closing batch was (DD-55). Needs Run_Jobs `incomplete-surveys` with `SUSPEND_GRACE_MINUTES` ≥ 8 (live since 11 Nov 2026). Expect fewer, longer sessions after upgrading.

### Fixed
- **Closing a tab that was hidden for a long time no longer reopens a session the backend already closed.** `pagehide` always suspended the session with one last batch (page view + `deepdots_session_suspend`) on its record, even when the tab had been hidden for hours and `incomplete-surveys` had already closed that record for inactivity. The backend rebuilt the feedback and ran its FEEDBACK_DONE actions again, so `#platform-visitors` got a second "Session journey" hours later (10 Nov: tab hidden at 13:56, session closed at 15:00, tab closed at 20:58, second message at 21:20). `pagehide` now applies the same rule as coming back to a hidden tab: hidden 30–50 min → the session is closed with `idle_timeout`; hidden longer → it is dropped without sending anything. Under 30 min nothing changes (a reload still continues the session).

## [1.20.0] — 2026-11-11

Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.1–3.6.0); bundled: 2.2.39.

### Added
- **React Native: promise rejections without `catch` are collected on their own.** Uncaught JS errors were already collected with no host code (`window` on web, `ErrorUtils` in React Native); a promise rejected without `catch` under Hermes was not. The React Native entry now wraps `HermesInternal.enablePromiseRejectionTracker` when the package is imported, before the app's `Sentry.init()`, so a tracker the host installs later (Sentry, Crashlytics) is composed with ours instead of replacing it, and its `allRejections: false` filter is respected. The rejection is stored and sent as a `deepdots_app_crash` (unhandled) like the other uncaught errors. `init({ autoTrack: { errors: false } })` turns automatic error collection off (a handler passed by hand with `installReactNativeCrashHandler` still works). Without Hermes (JSC) nothing changes. Taken from the parked auto-detection work (#82).
- **Logging in links the anonymous visitor to the user.** An app that starts without `userId` and sets it at login (`setUserId()` or `init()` again) used to look like two people: the anonymous id "left" at the login screen and a new user appeared, so a registration funnel counted people who did register as lost. Anonymous → identified is now treated as the same person: the new session's `deepdots_session_start` carries `identified: true`, `previous_user_id` (the anonymous id) and `previous_session_id` (the record just closed), and the popup history (shown, answered, message guards) is kept, so the user does not see the same popup again. The anonymous record is still closed with `user_change` and its own id, so nothing changes for the backend. User to user and logout behave as before, with no link.
- **Catalan (`ca`) popup texts.** Buttons, progress, aria-labels and error notices in Catalan; `ca`/`ca-ES` resolve to it. Catalan is not an official EU language; asked for in the v2.2.29 review. Same strings as the native SDK's `DefaultLabels.kt`.

### Fixed
- **CI and the SDK monitor run on Ubuntu 24.04.** GitHub moved `ubuntu-latest` to Ubuntu 26.04 on 8 Nov 2026 and Playwright does not support Chromium there yet, so the hourly web monitor failed before running any scenario ("no test results"). Every workflow now pins `ubuntu-24.04`. No SDK change.
- **Playwright 1.64.1 (from 1.60.0), which supports Ubuntu 26.04.** The cause of the failure above: Playwright learned Ubuntu 26.04 in 1.61, so 1.60 could not install Chromium there. Same version as MagicSurvey's monitors, which already pass on 26.04. The visual regression image moves to `mcr.microsoft.com/playwright:v1.64.1-noble`. With this the `ubuntu-24.04` pin is no longer needed to make the monitor work; it stays so that a runner image change never lands unannounced. Dev dependency only, no SDK change.

## [1.19.0] — 2026-11-06

Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.1); bundled: 2.2.39. Compatibility table: docs.deepdots.com/popup-web/reference/survey-compatibility/.

### Added
- **Popups follow the survey version assigned in the Admin (DD-70).** `GET /sdk/{publicKey}/popups` sends `surveyFrontend.sdkVersion` per popup (latest or pinned, resolved through the version registry). When it is one of `SUPPORTED_SURVEY_SDK_VERSIONS` (2.2.38, 2.2.39) the popup draws the survey with that exact `@magicfeedback/native` and with that version's survey CSS (vendored per version in `src/assets/survey-css`, scoped to the popup): in the DOM popup the JS comes from jsDelivr (unpkg as fallback) and the CSS from a lazy chunk; in the React Native WebView both come from the CDN. Missing, unsupported or failing to load → the bundled JS and CSS together (a load failure or an invalid version warns; unsupported only logs with `debug`). Debug log and `data-survey-sdk` on the popup say which one was used. `scripts/vendor-survey-css.mjs` takes `--src/--version/--out`. Release gate: the test app runs every supported version (`apps/test-app/e2e/survey-sdk.spec.ts`, `?surveySdk=<v>` in the service worker) inside "Smoke + regression · SDK local", a required check of the release PR, so a version whose JS or CSS does not load, draw or answer blocks the release.
- **The popup's own texts in the 24 official EU languages (DD-67).** Buttons (Send, Cancel, Start/Complete survey, Back), the progress counter, the follow-up badge, the accessibility labels and the notices are now translated into bg, cs, el, et, ga, hr, hu, it, lt, lv, mt, nl, pl, ro, sk and sl too (28 locales with en, es, da, no, sv, fi, de, fr, pt, ar, bn and zh-CN). A Polish survey used to show its own buttons in English. `resolveLocale` and the WebView mirror `RESOLVE_LOCALE_JS` recognise the new codes; anything else still falls back to English. Machine-translated, pending native review. Mirror of the native SDK's `DefaultLabels.kt`.
- **The SDK identifies itself on the data it sends (DD-3, Collection dashboard).** Every popup response now carries `deepdots_channel=popup` and `deepdots_sdk=web@<version>` (`react-native@<version>` from the React Native entry) in its feedback metadata, also with tracking off, so a response that came through a popup can be told apart from a MagicSurvey link and attributed to an SDK version. Every analytics batch carries `deepdots_sdk` too. The version is injected at build time from `package.json` (`scripts/sdk-version-define.mjs`), never kept by hand.
- **"Please enter a valid email address." for an email with a typo.** `@magicfeedback/native` 2.2.39 reports it as `SubmitError` with code `INVALID_EMAIL`, where earlier versions said `REQUIRED` / "No response" and the popup asked the visitor to answer a question they had answered (reported by Lemvigh-Müller). The popup shows the new `errorInvalidEmail` label (translated in all 28 locales) and keeps the page, like a required question; it is validation, so no `survey_error` is emitted. The reason is `invalid_email` in `classifySubmitError` and in the WebView mirror.
- **Session close on iOS without waiting for the next launch, with no code in the app (DD-55).** Measured in a production React Native app on SDK 1.17, about one iOS session in three was closed late, when the user opened the app again, or never, against about 2 % on Android: iOS suspends the app with the closing request in flight. The package now ships a tiny iOS native module (`ios/DeepdotsBackgroundTask.m`, podspec `MagicfeedbackPopupSdk`) that React Native autolinking links on `pod install`; every analytics request runs inside an iOS background task, ended when it settles or after 25 s (`BACKGROUND_TASK_MAX_MS`). Without the module (Expo Go, an app not rebuilt yet) nothing changes: the closing batch is still stored before it is sent and resent on the next launch. `init({ backgroundTask })` replaces the module with your own function; `backgroundTimerTask(BackgroundTimer)` adapts `react-native-background-timer`.
- **React Native lifecycle is automatic (`autoTrack.lifecycle`, on by default).** A React Native entry of the package (`dist/index.native.js`, picked by Metro through the `react-native` export condition, so imports do not change) lets the SDK listen to `AppState` itself: `active` opens a session, `inactive` sends what is pending with a `user_engagement` carrying the current screen (new `onInactive()`), `background` closes it. Hosts that already call `onForeground` / `onBackground` keep working and nothing is sent twice. `autoTrack: { lifecycle: false }` turns it off. Without `platform` in `init`, React Native now uses `Platform.OS` (it used to report `web`).

### Changed
- **`@magicfeedback/native` 2.2.39** (from 2.2.37), in the web bundle and as the default CDN version of the React Native WebView. It brings the `INVALID_EMAIL` submit error, so the popup now shows "Please enter a valid email address." for an email with a typo; the 24 official EU languages for the survey (DD-67); and the email field's `Option/Alt + 2` shortcut and optional @ button (DD-47). `src/assets/style.css` is re-vendored with the email @ rules. The 2.2.39 package ships its CSS minified, which `scripts/vendor-survey-css.mjs` cannot read, so this copy was vendored from the package's readable source (`src/styles/magicfeedback-default.css` at ba14d87, the commit 2.2.39 was published from).

### Fixed
- **The "Delay (seconds)" set in the Admin is honoured for every trigger type** (reported by MOM: an event trigger with a 60 s delay showed the popup at once). The SDK dropped `trigger.delaySeconds` when it read the popups, so the delay never applied to `event`, `click`, `scroll` or `time_on_page`; and for `exit`, where the Admin stores the delay in `delaySeconds` and `value` is 0, the exit popup always showed with no wait. Now the delay counts from the moment the trigger fires (for `time_on_page`, after the time on page). Exit popups made before `delaySeconds` existed, with the delay in `value`, keep working. While a popup waits: firing the same trigger again neither restarts nor duplicates it; changing route (or screen with `setScreen` in React Native) or the app going to background cancels it; and when it is due everything is checked again (segments, language, cooldowns), it is dropped if the same popup was shown in the meantime, and if another popup is open it is skipped without effects, as before. A delay of 0, or no delay, shows the popup at once, as before. Pending delays live in memory only, unlike the exit queue. `triggerSurvey(surveyId, popupId, { delaySeconds })` takes an optional delay too. Test app: scenario `rate-delay` (event + 60 s) in `e2e/regression/triggers.spec.ts`.

## [1.18.0] — 2026-10-30

### Added
- **`survey_error` event and `deepdots_survey_error` analytics event.** A page that can't be sent used to show the generic error message and leave the real cause only in the visitor's console. Now the popup emits `survey_error` with `{reason, message}` to host listeners, and with tracking on it sends `deepdots_survey_error` (`survey_id`, `popup_id`, `reason`, `message`) to analytics. `reason` is `send_failed`, `no_page` or `unknown`. An empty required question is not reported. The event is not an interaction (no `PARTIAL`), and when the survey reports the same error twice on completion only one event goes out. Works on the web popup and in the React Native WebView (`ReactNativePopupRenderer` forwards it).

### Changed
- **`@magicfeedback/native` 2.2.37** (from 2.2.33), in the web bundle and as the default CDN version of the React Native WebView. Survey submit errors now carry a `code` (`REQUIRED` / `SEND_FAILED` / `NO_PAGE`), and the popup uses it to tell an empty required question apart from a failed request: a request the API didn't save now shows `errorSubmit` instead of `errorRequired`. The label texts do not change. With an older native (CDN override) the popup falls back to the old check on the text. Also brings native 2.2.34–2.2.36: `?autoadvance=true` no longer shows the prefilled page before moving on, one Get Survey request per load instead of two when MagicSurvey hands it over, single choice in a row (`assets.direction: "row"`), and rating texts above or below the numbers. The survey stylesheet is re-vendored from 2.2.37.

## [1.17.2] — 2026-10-29

### Fixed

- **A popup that is not drawn is no longer counted as shown.** The browser renderer shows one
  popup at a time, but the SDK still emitted `popup_shown`, posted `SHOWED` and started the
  cooldown for every popup it was asked to show. The same trigger fired again while its popup
  was open (a host event repeated, an exit popup queued several times by fast navigation) sent
  duplicate `popup_shown`/`SHOWED`; a second popup due while another was open was reported as
  shown and lost its cooldown although the user never saw it. Now, while a popup is open, others
  are skipped without side effects. Renderers can opt in with the new optional
  `PopupRenderer.isShowing()`; renderers without it (React Native, custom) keep the previous
  behaviour. Found by the functional regression suite (MF-3245).
- **The SDK recovers when the popup renderer fails to download.** If the lazy `renderPopup`
  chunk could not be fetched (network lost before the idle preload finished, CDN error), the
  failed `import()` surfaced as an uncaught error in the host page and the browser renderer
  stayed "open": no other popup showed for the rest of the page load. The error is now caught
  (logged as a warning), the renderer is released, and the next trigger tries again.
- **A popup in a corner no longer blocks the host page.** With `position` `bottom`, `top` or any
  corner, the popup container still covered the whole viewport (transparent, so invisible) and
  took every click: while the popup was open the user saw the page but could not use it. The
  container now lets clicks through and only the popup card receives them. `center` keeps its
  backdrop and stays modal. Found by the functional regression suite (MF-3245).

## [1.17.1] — 2026-10-28

### Added

- **Compatibility manifest and release gate (MF-3241).** Every release now ships a compatibility
  manifest (`release/compatibility.json`: supported browsers and frameworks, the bundled
  `@magicfeedback/native`, the configuration schema, known-good popup fixtures and known
  issues), and its GitHub Release carries the exact tarball published to npm with its
  `SHA256SUMS` and a `release.json` that records the commit, CI run and approval. The supported
  versions policy is in `docs/VERSIONING.md`. No change to the SDK code.

## [1.17.0] — 2026-10-26

### Fixed

- **An analytics session no longer spills into another record when a response is lost.**
  The analytics `sessionId` is now generated by the SDK (UUID v4) when a session opens and
  goes in every batch from the first one. Before, the API assigned it in the response to the
  first `POST /sdk/feedback`; when that response did not reach the app (it went to the
  background with the request in flight), the rest of the session was sent without it and
  opened another record. The API already stores each batch under the `sessionId` it
  receives, so nothing changes on the backend. Batches no longer wait for the first response.
- **A batch that fails is retried in its own session.** A batch that fails transiently
  (network, 5xx, 408, 429, or no response in 20 s) is kept as it was built, with its
  `sessionId` and its `completed`, and resent before the next batch. Before, it went back to
  the event buffer and left with the next session in its record: in MOM (React Native), the
  closing batch of a session that reached the API but whose response was lost reappeared in
  the next session, with a `deepdots_mini_service_exit` whose enter was in another record
  (133 exits for 130 enters on the first day) and a duplicated `session_end`. The feedback
  sink no longer rejects, so the manager does not requeue its batches; custom sinks keep the
  old behaviour.
- **React Native: a closing batch that could not be sent is recovered on the next launch.**
  On a platform other than `web`, the closing batch is saved in `storage` (MMKV) before it is
  sent, and so is any batch that fails. If the app dies with one pending, the next `init()`
  sends it to its record. Pending batches older than 24 h are dropped. On the web nothing is
  persisted: the closing batch already leaves with `keepalive`, and tabs share
  `localStorage`. The API drops repeated events of a session when it assembles it, so a
  batch resent after being stored is harmless.
- **Crash capture works when consent is granted after `init()`.** The unhandled-error handlers
  (`window.onerror` / `unhandledrejection` on the web, `global.ErrorUtils` on React Native) were
  only installed in `init()`, and only if tracking was already enabled. An app that started with
  `trackingEnabled: false` and called `setTrackingEnabled(true)` later never captured an
  unhandled error, and `installReactNativeCrashHandler()` (what `<DeepdotsProvider>` /
  `setupReactNative()` call) was silently dropped while tracking was off. Now the handlers are
  installed as soon as consent is granted, and an `ErrorUtils` received before that is kept and
  hooked then. `reportError()` was not affected.
- **React Native apps that call `init()` directly also capture crashes.** Without
  `setupReactNative()`, nothing hooked `global.ErrorUtils`, so unhandled JS errors were never
  reported. `init()` now hooks it when the runtime provides it. Installing is idempotent: the
  Provider passing the same `ErrorUtils` again, or toggling consent, never chains a second
  handler (which would report every crash twice).

## [1.16.1] — 2026-10-23

### Fixed

- **`setContactAttributes()` retries after a failed send.** The SDK only sends contact
  attributes when they change, and it recorded them as sent even when
  `POST /sdk/popups/contact` failed (no network or a non-2xx response), so they were not sent
  again until a value changed. Now they are only recorded once the API accepts them, and the
  next call retries. `setContactAttributes()` resolves to `false` when the send fails.
- **Contact attributes are sent for every user on a shared device.** The "last sent" record
  did not include the user, so after `setUserId()` a second user with the same attributes as
  the previous one never sent theirs. After upgrading, each user's attributes are sent once
  more on the next call.

## [1.16.0] — 2026-10-23

### Fixed

- **A survey that fails to load no longer shows an empty survey with a Send button.** When
  `@magicfeedback/native` cannot load the survey (unknown key or product, so
  `GET /sdk/app/{survey}/{product}/info` answers 406 "Public key not found", or no network) it
  calls `onLoadedEvent({ loading: false, error })`, and the popup treated that as a normal
  load. Now the popup shows a translated notice ("We couldn't load this survey.", new
  `errorLoad` label in all 12 locales), keeps the close X and replaces the footer with a
  single Cancel button (`#dd-cancel`, `actions.decline.label` if the platform sets one) that
  closes the same way as the X. The popup is revealed right away instead of waiting for the
  deferred-opening ceiling. Same in the React Native WebView, which also covers the survey
  bundle failing to download from the CDN: it now sends `error:load` (or `error:init` /
  `error:exception`) as a JSON message `{name, payload: {message}}` instead of `loaded`
  (before, the CDN failure was the bare string `error:load`), and still sends `ready`, so a
  host that mounts its Modal on `onReady` shows the notice; `ReactNativePopupRenderer` also
  treats any `error:*` message as ready. The failed load is not reported as `popup_clicked`.
  Mirrors the same fix in the native SDK.

## [1.15.0] — 2026-10-21

### Added

- **`cspNonce` init option, for pages with a strict Content-Security-Policy.** With
  `style-src 'nonce-…'` and no `'unsafe-inline'`, the browser blocked the `<style>` elements
  the popup injects into `<head>`, and the survey rendered without its stylesheet (the card,
  backdrop and buttons survived because they use inline `element.style`). The popup now puts
  the nonce on all of them: survey stylesheet, alignment, spinner, responsive rules,
  `surveyCss` and the custom font's `@font-face`. A stylesheet already injected without the
  nonce is recreated, since the browser only checks the nonce on insertion. Web only: React
  Native renders the survey in its own WebView. Found while testing an Angular 22 app with
  SSR and a nonce-based CSP, where it is the `CSP_NONCE` token.

### Fixed

- **Only one `#deepdots-popup-container` in the DOM.** `init()` added a second, empty and
  hidden container with the same id next to the renderer's: the core created its own for a
  fallback path that never ran (the renderer always exists). The container is now created only
  by the renderer, and with a custom renderer (`setRenderer`) the SDK adds none.

## [1.14.0] — 2026-10-20

### Changed

- **`@magicfeedback/native` 2.2.33** (from 2.2.31), in the web bundle and as the default CDN
  version of the React Native WebView. A follow-up question now sends the survey's previous
  answers and upcoming questions, so the API can avoid asking what was already answered or is
  about to be asked (v4 follow up, chosen per survey by platform admins; every survey is on
  v3 by default, so nothing changes until one is switched);
  AI survey previews store nothing; `?<ref>=<value>&autoadvance=true` sends a prefilled first
  page on its own; a `RATING_STAR` prefilled from the URL shows its stars. The survey
  stylesheet is unchanged (re-vendored from 2.2.33).

## [1.13.0] — 2026-10-16

### Fixed

- **The last screen of a session is no longer lost when the session never closes.**
  `deepdots_page_view` goes out when the user *leaves* a screen or the session closes, and
  the 5-minute heartbeat only sent `deepdots_user_engagement`, which carried no screen. A tab
  hidden for 50 minutes or more is discarded on return without sending anything, and a tab or
  app killed while in the background loses its closing batch: the backend then closes the
  record with only its start, so a one-screen visit had no page view at all (~24 % of the
  sessions on our own platform after 1.8.3) and a longer one lost its last screen. Every
  `deepdots_user_engagement` (heartbeat and the one sent when the tab is hidden) now also
  carries the screen the user is on: `screen` and `path` (the same values its page view will
  carry) and `screen_seconds` (time on that screen so far, measured like the page view's
  `duration_seconds`). The engagement sent while closing the session carries none of them,
  because that screen has just got its page view. No extra page views are emitted, so nothing
  is counted twice; the event name and its `engagement_time_msec` are unchanged. The journey
  builder uses the new params to add the missing screen.

## [1.12.0] — 2026-10-15

### Added

- **`deepdots_session_start` says why the session started**, in a new `reason` param, so
  analytics can tell a real start from a return to the app ("sessions that started on this
  screen" counted every return from the background as a new start in React Native and the
  native SDK). Values: `cold_start` (`init()`: page load or app launch), `foreground`
  (`onForeground()` after the session was closed), `tracking_enabled`
  (`setTrackingEnabled(true)`), `user_change` (`setUserId()` or `init()` with another
  `userId`), `idle_timeout` (the tab is seen again after more than 30 min hidden) and
  `bfcache_restore` (back from the bfcache after the resume window). Same values as the
  native SDK where the meaning is the same. The type is exported as `SessionStartReason`.
  The event name and every other event are unchanged.

## [1.11.0] — 2026-10-13

### Added

- **Focus on text questions.** When the first question of a page is a text field (text, long
  text, email or number), the cursor is placed in it: when the popup opens only on devices with
  a mouse or trackpad, and after Start, Next or Back on every device. A page that starts with any
  other question type is left alone, and a field of the host page never loses its focus. The
  focus comes from `@magicfeedback/native` (`autofocus: 'navigation'` and
  `focusFirstQuestion()` once the popup is revealed), so it needs the native version that ships
  that option. Web DOM popup and React Native WebView; `DeepdotsProvider` sets
  `keyboardDisplayRequiresUserAction` to `false` so iOS opens the keyboard for it.

### Changed

- **Web: `popup_clicked` is now user interaction only**, as in the native SDK. The DOM popup
  no longer emits it for things nobody did: `action: 'loaded'` (the survey finished loading),
  `'before_submit'`, `'validation_error_required'` and `'submit_error'`. One tap on Back now
  emits one `back` instead of two. Hosts that listened for `loaded` or the error actions to
  drive their own UI need another signal; the submit error text is still logged through the
  SDK logger. Nothing changes for the backend: none of these posted a popup status.

### Fixed

- **Reloading the page no longer splits the analytics session in two.** The browser fires
  `pagehide` on a reload (Cmd+R / F5) or a full-page navigation exactly as when the tab is
  closed, and the SDK closed the session there: every reload produced two feedbacks (and two
  messages in the Slack actions). `pagehide` now *suspends* the session — it sends what is
  pending with a `deepdots_session_suspend` event and no `completed`, and keeps the record id
  in `sessionStorage`. The next load in the same tab within a minute carries on in that record,
  with a `deepdots_session_resume` event instead of `deepdots_session_start`. A tab that is
  really closed is closed by the backend a few minutes later (`incomplete-surveys` job,
  `SUSPEND_GRACE_MINUTES`), which must be deployed with this version. When the record is not
  known yet at `pagehide`, or there is no `sessionStorage`, the session closes as before.

- **Events fired before the popups load are no longer lost.** `init()` fetches the popup
  definitions asynchronously, so a `triggerEvent('app_opened')` (or `triggerSurvey`) called
  right after it ran against an empty list and was dropped with "No event popup definitions
  found", even when the popup arrived milliseconds later. While that fetch is in flight, these
  calls are now kept (up to 20; past that the oldest is dropped) and replayed in order once the
  definitions load, through the normal evaluation: segments, `excludedPaths`, cooldowns and
  conditions apply with the state at that moment. If the fetch fails they are discarded and
  nothing is kept from then on. Without an `apiKey` there is no fetch and nothing is kept.
  Same behaviour as the native SDK.

- **React Native: loading the survey no longer marks the popup as `PARTIAL`.**
  `ReactNativePopupRenderer.handleMessage` counted the WebView's `loaded` message as the first
  interaction, so every popup that opened posted `PARTIAL` to `POST /sdk/popups` (inflating
  "started" in the dashboards) and fired a `popup_clicked` to host listeners with nobody
  touching it. Now only a real interaction (sending an answer, or going back) does, once per
  popup.

## [1.10.0] — 2026-10-08

### Added

- **Multi-language surveys.** The popup now passes the language resolved at `init` (the
  explicit `language`, else the browser or device language) to `@magicfeedback/native` as
  `generate({ lang })`, on web and in the React Native WebView. Native asks the API for that
  language and, when the survey does not have it, the API serves the survey's default.
- The popup chrome (buttons, progress, aria-labels) follows the language native reports in
  `onLoadedEvent` (`lang`, native ≥ 2.3). With older native versions it keeps using the first
  entry of `formData.lang`, the survey's default language.

### Changed

- **`@magicfeedback/native` 2.2.31** (from 2.2.22), in the web bundle and as the default CDN
  version of the React Native WebView. Brings the MaxDiff question type, the 300 ms pause
  before an option auto-advances (so the pick is seen checked), the ghost tap guard after a
  page change, the narrow-container layouts of the matrix and the numeric rating, and the
  `autofocus` option used for the focus on text questions. The survey stylesheet is
  re-vendored from 2.2.31; the hover rules nested in the matrix's container query are now
  gated behind `@media (hover: hover)` too, so an option no longer looks selected on touch.

## [1.9.0] — 2026-10-06

### Added

- **The id of the feedback a session becomes is readable.** `getFeedbackSessionId()` returns
  the `sessionId` that `POST /sdk/feedback` returned for the open session, which the API stores
  as `sdkSessionId` on its feedback, and `init({ onFeedbackSession })` reports it with
  `status: 'open'` when the session's first batch is accepted and `'closed'` when the closing
  one is. A host can hand it to its backend to find that feedback and add data to it. Until now
  the SDK kept it internal, so nothing could link a session to its feedback.

### Fixed

- **A closed session no longer comes back through a late response.** When a batch was still
  in flight as the session closed, its response arrived afterwards and the SDK cached the closed
  session's `sessionId` again, so the next session wrote into the closed record and the API built
  a second feedback for it. In React Native on iOS this happened on every quick return to the
  app: AppState `inactive` sends a regular batch and `background` closes the session a few ms
  later, and iOS suspends the app before the first response arrives. It also happened on the web
  after a return from the bfcache, when the page hid while its first batch was in flight.
  Responses from a session that is already closed are now ignored.

- **Survey options no longer look selected on touch screens before the user taps them.** WebKit
  keeps `:hover` stuck on the last point touched, so the option of the next page that landed there
  showed the brand border and grey fill, as if chosen. Every `:hover` rule of the vendored survey
  CSS now sits behind `@media (hover: hover)` (mouse and trackpad keep it); groups that mixed
  `:hover` with `:focus`/`:focus-visible` were split so keyboard focus still shows on touch
  devices. Affects the DOM popup on mobile web, the React Native WebView and, once its pinned
  stylesheet version is bumped, the native SDK.

## [1.8.5] — 2026-09-30

### Added

- **`deepdots_page_view` carries the real `path`** next to the normalized `screen`:
  `/insights/requests/2f1c…` where `screen` says `/insights/requests/:id`, query string still
  dropped. Group by `screen`; use `path` to link a visit to the item it was about (the platform's
  session messages link each research this way).

### Changed

- **Moving between two items of the same screen is a new page view.** Going from one request to
  another (`/insights/requests/A` → `/B`) used to be swallowed as "same screen" because both
  normalize to `/insights/requests/:id`; only a query-string change is ignored now.

## [1.8.4] — 2026-09-30

### Changed

- **The analytics dry-run log only appears with `debug: true`.** Without `init.analytics` the
  SDK sends nothing and used to print the would-be payload of every batch
  (`[DeepdotsAnalytics] (dry-run · NOT sent · no init.analytics) …`) to the host's console on
  every page, even in production. It now goes through the same `debug` gate as the rest of the
  SDK logs. Nothing else changes: without `init.analytics` no data is sent, as before.

## [1.8.3] — 2026-09-29

### Fixed

- **Analytics sessions in use are no longer closed by the backend as abandoned.** The backend
  closes a session after a window without batches, but a visible tab sent nothing while the
  user read one page (a page view is emitted on leaving a screen, engagement only on hide or
  close). The session was closed with just its `deepdots_session_start` — the "0 pages, 0
  seconds" sessions — and what the user did next arrived as a second fragment. A visible tab
  (or a React Native app in the foreground) now sends its engagement at least every 5 minutes.
- **A tab that comes back after 30 minutes hidden starts a new session** (`session_end`
  reason `idle_timeout`). Before, it kept the old session id, so a session the backend had
  already closed received more batches and was assembled twice. After 50 minutes or more
  hidden the old session is dropped without sending anything, since the backend has already
  closed it.
- **React Native apps flush on a timer too.** They only sent a batch on reaching the batch
  size or going to the background.
- **The IP geolocation lookup only runs when its result is actually sent.** On every `init()`
  the SDK called third-party services (`ipapi.co`, then `ipwho.is`, then `ipinfo.io` as
  fallbacks, 3 s timeout each), even without `analytics` configured (the result went nowhere),
  with `trackingEnabled: false`, and on every page load despite the 30-day cache. Now it only
  runs with `analytics` configured, tracking enabled and no fresh cached value, at most once
  per SDK instance. With consent granted later, it waits for `setTrackingEnabled(true)`.

### Added

- **`geolocation?: boolean` init option** (default `true`). With `false` the SDK never calls
  the geolocation services and sends no country or city.

## [1.8.2] — 2026-09-25

### Fixed

- **Web analytics sessions now actually close, so their data reaches the dashboard.** The last
  batch of a session is the only one with `completed: true`, and the API only assembles a
  session into a feedback when that batch arrives. It was sent with `navigator.sendBeacon`,
  which always includes credentials and, with an `application/json` body, needs a CORS
  preflight. The API answers `Access-Control-Allow-Origin: *` with
  `Access-Control-Allow-Credentials: true`, which browsers reject for credentialed requests,
  so the preflight failed and the batch was never sent. Sessions ending in a tab close never
  completed, and none of their events (page views included) reached analytics. Every batch
  now goes through `fetch` with `credentials: 'omit'`, and the closing one also with
  `keepalive`, which survives the page unload just as `sendBeacon` did.
- **No more orphan record per closed tab.** In Chromium `visibilitychange` fires after
  `pagehide`; the engagement timer kept running after the session closed and sent a
  `user_engagement` event without a session id, which opened a record that never closes.
- **Tabs opened in the background no longer count engagement nobody saw.** The timer now
  starts with the session and only while the tab is visible.
- **Returning to a page from the back/forward cache resumes tracking.** The `pagehide` had
  closed the session and stopped the periodic flush, and nothing reopened them until a reload.
- **Several tabs no longer overwrite each other's popup redisplay history.** Each tab read it
  only at `init` and then rewrote the whole record from memory, so one tab could show a popup
  another had just shown and could erase a survey marked as completed. The record is now
  merged (the most recent entry wins) before every decision and every write.

### Deprecated

- `FeedbackSinkOptions.sendBeaconImpl` is ignored and kept only for type compatibility.


## [1.3.0] — 2026-07-31

### Changed

- **All console output is now in English.** Ten log strings were still in Spanish, including
  the `trackMessage` rejection warning added in 1.2.0. The text is what an integrator reads
  when something is wrong, and the rest of the SDK's output, docs and API were already in
  English — so grepping the console for the message from the docs found nothing.

  Affected: the `trackMessage discarded (…)` warning and the three `MessageGuard` reasons,
  the analytics dry-run label, the `/sdk/feedback` transport logs (final flush via
  `sendBeacon`, `sendBeacon` rejection, missing `fetch`, rejected batch, cached
  `feedbackSessionId`), the retryable-status rejection message, and the
  `ReactNativePopupRenderer` missing-`onShow` warning.

### Fixed

- **React Native survey popups now render the actual popup (header, logo, "Start survey"
  gate, footer with Back/Send, spinner) instead of the bare, unstyled survey form.** The RN
  `WebView` renderer only ever called `@magicfeedback/native`'s `form.generate()` directly —
  it never had the chrome that `renderPopup.ts` builds by hand for the web popup. Ported
  that same chrome and button/state logic into `buildSurveyHtml` (it has to be self-contained
  markup, since it runs inside the WebView's own page), and wired `actions`/`theme`/`position`
  through `ReactNativePopupRenderer.show()`, which received them already but discarded them.

  Along the way, found and fixed the actual bugs that made the popup appear blank or broken:
  - The `<WebView>` had no `style` prop, so it could render at zero size.
  - `source={{ html }}` had no `baseUrl`. Without one, WKWebView gives the page an opaque
    origin, and the survey's own internal fetch for its content silently failed (`<script>`/
    `<link>` loads aren't affected, since those aren't subject to CORS the same way).
  - The popup's own stylesheet was never linked — only the survey library's generic CDN
    default was, which isn't the one the web popup actually uses.
  - `.magicfeedback-radio` in `assets/style.css` was unqualified, so it also matched the
    `<input>` of rating questions (`@magicfeedback/native` reuses that class name there),
    breaking its size. Qualified to `div.magicfeedback-radio` — this was latent in the web
    popup too, not RN-specific.
  - The horizontal-overflow safety net was scoped to `#mf`, which the survey library replaces
    with its own container on mount — the rule never matched anything real. Rescoped to
    `.deepdots-popup-main` with `overflow-x:hidden`.

  Also: option rows are more compact on narrow screens (`@media max-width:640px`), and the
  popup logo's bottom margin is 20px instead of 42px.

  Log text is not API: nothing to change in your code unless you were matching on these
  strings. Mirrored in the KMP SDK, so both platforms print the same text.

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
