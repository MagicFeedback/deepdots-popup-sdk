# Deepdots | Popup SDK Release Validation Report

**SDK:** Deepdots web popup SDK **1.19.0** (npm `@magicfeedback/popup-sdk@1.19.0`)  
**Validation date:** 2026-11-06  
**Platforms:** Desktop web / Mobile web  
**Overall status:** **FAILED**  
**Report type:** Automated release validation, generated from the CI test results (no manual edits)

---

## 1. Executive Summary

SDK 1.19.0 was validated as published on npm, loaded from the CDN by a test store that integrates it the same way a customer site does, on desktop and mobile Chromium.

Results ([CI run](https://github.com/MagicFeedback/deepdots-popup-sdk/actions/runs/42234122724/attempts/1)):

- **86** automated test executions on **2** configurations (1 Desktop web, 1 Mobile web)
- **83** passed (1 on the automatic retry)
- **2** failed
- **1** not applicable on that platform
- Manual pass on real devices: **pending** (section 7)

**Desktop web:** FAILED · **Mobile web:** PASSED

**Validation status:** **FAILED**

### Failures

| Platform | Configuration | Test | Detail |
|---|---|---|---|
| Desktop web | Desktop web | triggers › evento + Delay 60 s (MOM): no sale al momento ni a los 59 s, sí a los 60 s, una vez |  |
| Desktop web | Desktop web | triggers › evento + Delay 60 s: cambiar de página durante la espera lo cancela |  |

## 2. Test Results

| Test category | Desktop web | Mobile web |
|---|---|---|
| SDK initialization and version check | PASS | — |
| Path-based triggers and excluded screens | PASS | — |
| Time-based triggers | PASS | — |
| Scroll triggers | PASS | — |
| Event and click triggers | **FAIL** | — |
| Exit triggers | PASS | — |
| Re-display rules (cooldown) | PASS | — |
| Audience segmentation by language | PASS | — |
| Popup layout, opening and closing | PASS | PASS |
| Survey interactions and submission | PASS | n/a |
| SPA navigation with a popup open | PASS | — |
| Network failures and recovery | PASS | PASS |
| Host page safety | PASS | PASS |
| Detection check: a missing navigation event is caught | PASS | — |
| Survey SDK versions assigned in the Admin (DD-70) | PASS | — |
| Visual regression | NOT YET AUTOMATED | NOT YET AUTOMATED |

`—` = not part of that platform's suite.

<details><summary>Every test on every configuration</summary>

| Test | Desktop web | Mobile web |
|---|---|---|
| host safety › el chunk del renderer no se descarga: sin errores en la página, y el SDK no se queda bloqueado | pass | pass |
| host safety › encuesta a medio pintar (respuesta corrupta): el popup se puede cerrar y el host sigue | pass | pass |
| host safety › encuesta lenta: mientras carga el host responde, y si se cierra no reaparece al llegar | pass | pass |
| host safety › errores 500 en eventos y respuestas: el popup avisa al enviar y el host sigue | pass | pass |
| host safety › la API de popups no contesta nunca: ni popup ni bloqueo | pass | pass |
| host safety › popup en esquina (bottom-right): fuera de la tarjeta, los clics llegan al host | pass | pass |
| host safety › popup en esquina (top-left): fuera de la tarjeta, los clics llegan al host | pass | pass |
| host safety › ráfaga de navegación con popups de por medio: la tienda sigue respondiendo | pass | pass |
| host safety › sin red (offline) al abrir: el popup avisa, se cierra y la SPA sigue navegando | pass | pass |
| host safety › tras cerrar un popup en esquina no queda ninguna capa | pass | pass |
| init › carga tras el consentimiento de cookies: los triggers funcionan desde ese momento | pass | – |
| init › evento del host antes de que lleguen las definiciones: se guarda y sale al cargar | pass | – |
| init › init + autoLaunch dos veces (StrictMode): un GET, un popup y un solo SHOWED | pass | – |
| init › un init: un solo GET de popups y el trigger de tiempo funciona | pass | – |
| known issues (host widgets) › la burbuja de chat del host no tapa la X de un popup abajo a la derecha | retry | – |
| live DEV config › ?popups=live: la API de DEV sirve la config de la test app y el popup sale | pass | – |
| missing navigation event › control: con navegación normal el mismo flujo sí lo muestra | pass | – |
| missing navigation event › sin evento de navegación, el exit trigger no salta y el test lo detecta | expected | – |
| multi-language › el selector de idioma del host cambia la tienda y el popup | pass | – |
| multi-language › lang=en: solo sale la variante inglesa, con la encuesta en inglés | pass | – |
| navigation › atrás del navegador (popstate) desde /checkout dispara el exit en la ruta anterior | pass | – |
| navigation › con un popup abierto, el host sigue navegando (atrás del navegador) | pass | – |
| navigation › ida y vuelta a /checkout antes del retraso del exit: no sale (el usuario volvió) | pass | – |
| navigation › navegación rápida saliendo varias veces de /checkout: un solo popup de exit | pass | – |
| navigation › pushState: llegar a /checkout antes de que venza el tiempo muestra el popup allí | pass | – |
| navigation › salir de /checkout antes de que venza el tiempo: el popup no sale en otra ruta | pass | – |
| popup UI › cerrar con la X: no queda nada del popup que estorbe al host | pass | pass |
| popup UI › envío completo contra DEV: survey_completed y la respuesta llega a la integración de DEV | pass | skip |
| popup UI › posición bottom-left: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición bottom-right: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición bottom: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición center: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición top-left: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición top-right: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › posición top: dentro del viewport, anclado donde toca, y se cierra | pass | pass |
| popup UI › redimensionar con el popup abierto (escritorio → móvil → escritorio): sigue dentro y anclado | pass | pass |
| popup load failure keeps the host usable › GET de popups con 500: no sale ningún popup y la tienda sigue funcionando | pass | – |
| popup load failure keeps the host usable › el SDK no llega a cargar (CDN caído): la tienda sigue funcionando | pass | – |
| popup load failure keeps the host usable › encuesta con network: el popup avisa, se cierra y la tienda sigue funcionando | pass | – |
| popup load failure keeps the host usable › encuesta con survey406: el popup avisa, se cierra y la tienda sigue funcionando | pass | – |
| re-display and audience › cooldown COMPLETED de 30 días: contestada no vuelve, y a los 31 días sí | pass | – |
| re-display and audience › cooldown SHOWED de 1 día: a las 23 h no vuelve y a las 25 h sí | pass | – |
| re-display and audience › dos pestañas: lo que vio la primera cuenta en la segunda (localStorage compartido) | pass | – |
| re-display and audience › segmentación: idioma y rutas excluidas a la vez (lang=en, not-on-cart) | pass | – |
| release fixtures › full-definition: se muestra con el evento fixture_full | pass | – |
| release fixtures › hash-route-dark: se muestra con el evento fixture_hash | pass | – |
| release fixtures › minimal-event: se muestra con el evento fixture_minimal | pass | – |
| smoke › CSS del host en conflicto y overlays: el popup se puede usar y cerrar | pass | – |
| smoke › carga la versión pedida, en DEV, y lo deja en el log del run | pass | – |
| smoke › click: el botón de ayuda del footer abre su popup | pass | – |
| smoke › event: «Valorar» dispara el evento del host y abre la encuesta compleja | pass | – |
| smoke › excludedPaths: no sale en /cart y sí en el resto | pass | – |
| smoke › exit: al salir de /checkout sale el popup en la ruta de destino | pass | – |
| smoke › path targeting: el mismo popup NO sale fuera de /checkout | pass | – |
| smoke › re-display: con cooldown SHOWED no vuelve a salir tras recargar, y sí tras borrar el historial | pass | – |
| smoke › time_on_page + path: el popup sale a los 3 s en /checkout y carga la encuesta de DEV | pass | – |
| survey SDK versions (DD-70) › 2.2.38: JS y CSS de esa versión, el survey se pinta y se responde | pass | – |
| survey SDK versions (DD-70) › 2.2.39: JS y CSS de esa versión, el survey se pinta y se responde | pass | – |
| survey SDK versions (DD-70) › la lista de versiones se lee del código | pass | – |
| triggers › click: doble clic en el botón de ayuda abre un solo popup | pass | – |
| triggers › dos popups distintos a la vez: sale el primero y el segundo no cuenta como mostrado | pass | – |
| triggers › evento + Delay 60 s (MOM): no sale al momento ni a los 59 s, sí a los 60 s, una vez | fail | – |
| triggers › evento + Delay 60 s: cambiar de página durante la espera lo cancela | fail | – |
| triggers › evento del host repetido 5 veces seguidas: un popup, un popup_shown y un SHOWED | pass | – |
| triggers › scroll 50 %: al 30 % no sale y al pasar del 50 % sí, una sola vez | pass | – |
| triggers › time_on_page 3 s: a los 2 s no ha salido y a los 3,5 s sí | pass | – |

</details>

## 3. Tested Environments

| Platform | OS version | Device | Build | SDK resolved | Engine | Result |
|---|---|---|---|---|---|---|
| Desktop web | Linux (CI) | Desktop 1280×860 | Chromium | 1.19.0 | Playwright 1.60.0 | **FAIL** |
| Mobile web | Linux (CI) | Pixel 7 emulation (412×915) | Chromium | 1.19.0 | Playwright 1.60.0 | PASS |

All automated tests ran against the Deepdots development environment with test companies only. No customer data was used, and the test store blocks and fails on any request to the production API.

## 4. Critical Safety Validation

| Scenario | Desktop web | Mobile web |
|---|---|---|
| Clicks outside a corner popup reach the page | PASS | PASS |
| No invisible layer left after closing a popup | PASS | PASS |
| Slow survey: the page responds while it loads | PASS | PASS |
| No network: notice, the popup can be closed, the page stays usable | PASS | PASS |
| Survey that cannot load (406): notice, can be closed, page usable | PASS | — |
| SDK script not reachable (CDN down): the page stays usable | PASS | — |
| Popups API that never answers: no popup, nothing blocked | PASS | PASS |
| Server errors on popups, events and answers | PASS | PASS |
| Broken survey response: the popup can be closed | PASS | PASS |
| Host CSS conflicts and overlays | PASS | — |
| Rapid navigation with popups | PASS | PASS |
| SDK initialised twice (React StrictMode): one popup | PASS | — |
| The same host event 5 times: one popup | PASS | — |

## 5. Detection Controls and Backward Compatibility

The test system has to prove it catches real problems. These controls run in every validation:

| Control | Result |
|---|---|
| Expected failure detected: missing navigation event › sin evento de navegación, el exit trigger no salta y el test lo detecta | Desktop web PASS |

## 6. Known Issues & Limitations

**Known blocking issues:** see Failures in section 1.

**Known non-blocking issues:**

- None.

**Test limitations:**

- Automated on Chromium (desktop, and mobile with Pixel 7 emulation). Safari and Firefox are checked by hand (section 7).
- On mobile the host-safety and popup layout suites run; triggers and navigation run on desktop and use the same code path.
- Visual regression (screenshot comparison) is not yet automated for the web SDK.
- Tests marked as known issues are expected to fail until their fix ships; if one passes, the run fails so the mark is removed.

## 7. Real Devices (manual)

**Status: PENDING.** Filled in by hand after this report is generated: the test store with this exact version in the browsers the automated suite does not run.

| Check | Safari (macOS) | Safari (iPhone) | Firefox |
|---|---|---|---|
| Popup appears complete, once | pending | pending | pending |
| Survey answered and sent to the end | pending | pending | pending |
| Not shown again within its cooldown | pending | pending | pending |
| Clicks outside the popup reach the page; X closes it | pending | pending | pending |
| Exit popup on leaving /checkout | pending | pending | pending |
| No network: notice, can be closed, page usable | pending | pending | pending |

## 8. Release Information

- **SDK version:** 1.19.0
- **Release:** [GitHub release v1.19.0](https://github.com/MagicFeedback/deepdots-popup-sdk/releases/tag/v1.19.0)
- **Changelog:** [CHANGELOG](https://github.com/MagicFeedback/deepdots-popup-sdk/blob/main/CHANGELOG.md)
- **Test execution:** [CI run](https://github.com/MagicFeedback/deepdots-popup-sdk/actions/runs/42234122724/attempts/1) (logs, screenshots and per-configuration artifacts)
- **Validation date:** 2026-11-06
- **Results file SHA-256:** `9bce63e8a1d930c69b7ac96f45203ffc6a988ca9bb00d801bcc8a3ba66b23b10`

### Release notes 1.19.0

Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.1); bundled: 2.2.39. Compatibility table: docs.deepdots.com/popup-web/reference/survey-compatibility/.

#### Added
- **Popups follow the survey version assigned in the Admin (DD-70).** `GET /sdk/{publicKey}/popups` sends `surveyFrontend.sdkVersion` per popup (latest or pinned, resolved through the version registry). When it is one of `SUPPORTED_SURVEY_SDK_VERSIONS` (2.2.38, 2.2.39) the popup draws the survey with that exact `@magicfeedback/native` and with that version's survey CSS (vendored per version in `src/assets/survey-css`, scoped to the popup): in the DOM popup the JS comes from jsDelivr (unpkg as fallback) and the CSS from a lazy chunk; in the React Native WebView both come from the CDN. Missing, unsupported or failing to load → the bundled JS and CSS together (a load failure or an invalid version warns; unsupported only logs with `debug`). Debug log and `data-survey-sdk` on the popup say which one was used. `scripts/vendor-survey-css.mjs` takes `--src/--version/--out`. Release gate: the test app runs every supported version (`apps/test-app/e2e/survey-sdk.spec.ts`, `?surveySdk=<v>` in the service worker) inside "Smoke + regression · SDK local", a required check of the release PR, so a version whose JS or CSS does not load, draw or answer blocks the release.
- **The popup's own texts in the 24 official EU languages (DD-67).** Buttons (Send, Cancel, Start/Complete survey, Back), the progress counter, the follow-up badge, the accessibility labels and the notices are now translated into bg, cs, el, et, ga, hr, hu, it, lt, lv, mt, nl, pl, ro, sk and sl too (28 locales with en, es, da, no, sv, fi, de, fr, pt, ar, bn and zh-CN). A Polish survey used to show its own buttons in English. `resolveLocale` and the WebView mirror `RESOLVE_LOCALE_JS` recognise the new codes; anything else still falls back to English. Machine-translated, pending native review. Mirror of the native SDK's `DefaultLabels.kt`.
- **The SDK identifies itself on the data it sends (DD-3, Collection dashboard).** Every popup response now carries `deepdots_channel=popup` and `deepdots_sdk=web@<version>` (`react-native@<version>` from the React Native entry) in its feedback metadata, also with tracking off, so a response that came through a popup can be told apart from a MagicSurvey link and attributed to an SDK version. Every analytics batch carries `deepdots_sdk` too. The version is injected at build time from `package.json` (`scripts/sdk-version-define.mjs`), never kept by hand.
- **"Please enter a valid email address." for an email with a typo.** `@magicfeedback/native` 2.2.39 reports it as `SubmitError` with code `INVALID_EMAIL`, where earlier versions said `REQUIRED` / "No response" and the popup asked the visitor to answer a question they had answered (reported by Lemvigh-Müller). The popup shows the new `errorInvalidEmail` label (translated in all 28 locales) and keeps the page, like a required question; it is validation, so no `survey_error` is emitted. The reason is `invalid_email` in `classifySubmitError` and in the WebView mirror.
- **Session close on iOS without waiting for the next launch, with no code in the app (DD-55).** Measured in a production React Native app on SDK 1.17, about one iOS session in three was closed late, when the user opened the app again, or never, against about 2 % on Android: iOS suspends the app with the closing request in flight. The package now ships a tiny iOS native module (`ios/DeepdotsBackgroundTask.m`, podspec `MagicfeedbackPopupSdk`) that React Native autolinking links on `pod install`; every analytics request runs inside an iOS background task, ended when it settles or after 25 s (`BACKGROUND_TASK_MAX_MS`). Without the module (Expo Go, an app not rebuilt yet) nothing changes: the closing batch is still stored before it is sent and resent on the next launch. `init({ backgroundTask })` replaces the module with your own function; `backgroundTimerTask(BackgroundTimer)` adapts `react-native-background-timer`.
- **React Native lifecycle is automatic (`autoTrack.lifecycle`, on by default).** A React Native entry of the package (`dist/index.native.js`, picked by Metro through the `react-native` export condition, so imports do not change) lets the SDK listen to `AppState` itself: `active` opens a session, `inactive` sends what is pending with a `user_engagement` carrying the current screen (new `onInactive()`), `background` closes it. Hosts that already call `onForeground` / `onBackground` keep working and nothing is sent twice. `autoTrack: { lifecycle: false }` turns it off. Without `platform` in `init`, React Native now uses `Platform.OS` (it used to report `web`).

#### Changed
- **`@magicfeedback/native` 2.2.39** (from 2.2.37), in the web bundle and as the default CDN version of the React Native WebView. It brings the `INVALID_EMAIL` submit error, so the popup now shows "Please enter a valid email address." for an email with a typo; the 24 official EU languages for the survey (DD-67); and the email field's `Option/Alt + 2` shortcut and optional @ button (DD-47). `src/assets/style.css` is re-vendored with the email @ rules. The 2.2.39 package ships its CSS minified, which `scripts/vendor-survey-css.mjs` cannot read, so this copy was vendored from the package's readable source (`src/styles/magicfeedback-default.css` at ba14d87, the commit 2.2.39 was published from).

#### Fixed
- **The "Delay (seconds)" set in the Admin is honoured for every trigger type** (reported by MOM: an event trigger with a 60 s delay showed the popup at once). The SDK dropped `trigger.delaySeconds` when it read the popups, so the delay never applied to `event`, `click`, `scroll` or `time_on_page`; and for `exit`, where the Admin stores the delay in `delaySeconds` and `value` is 0, the exit popup always showed with no wait. Now the delay counts from the moment the trigger fires (for `time_on_page`, after the time on page). Exit popups made before `delaySeconds` existed, with the delay in `value`, keep working. While a popup waits: firing the same trigger again neither restarts nor duplicates it; changing route (or screen with `setScreen` in React Native) or the app going to background cancels it; and when it is due everything is checked again (segments, language, cooldowns), it is dropped if the same popup was shown in the meantime, and if another popup is open it is skipped without effects, as before. A delay of 0, or no delay, shows the popup at once, as before. Pending delays live in memory only, unlike the exit queue. `triggerSurvey(surveyId, popupId, { delaySeconds })` takes an optional delay too. Test app: scenario `rate-delay` (event + 60 s) in `e2e/regression/triggers.spec.ts`.
