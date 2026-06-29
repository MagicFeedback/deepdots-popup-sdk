# Crash Reporting (KMP, managed errors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the Web crash-reporting feature in the KMP SDK: a `CrashReporter` in `commonMain` (build records, disk queue via `KeyValueStorage`, `reportError`, drain/replay), platform actuals that install MANAGED uncaught-exception handlers (Android `Thread.setDefaultUncaughtExceptionHandler`, iOS `NSSetUncaughtExceptionHandler`), wiring in `DeepdotsPopups.init()` (install gated by tracking, `deepdots_session_start`, replay), and a public `reportError()`.

**Architecture:** `CrashReporter` lives entirely in `commonMain` and is testable in `commonTest` with an `InMemoryStorage` and injected clock/device/session. Platform handler installation is an `expect fun installCrashHandlers(reporter, enabled)` with Android + iOS actuals; the handlers call `reporter.captureUnhandled(crashType, message, stack)` with already-extracted strings (so the core stays platform-free) and chain to the previous handler. Device/session context is captured at crash time and stored per record. Events are emitted through the existing analytics channel as `deepdots_app_crash` / `deepdots_session_start` (already documented from the Web plan). This is the exact parity counterpart of `src/analytics/crash-reporter.ts`.

**Tech Stack:** Kotlin Multiplatform, kotlinx.serialization, kotlin.test, Gradle. Managed exceptions only (NSException / JVM `Throwable`); native signal capture (PLCrashReporter / xCrash) is a later plan.

**Scope (this plan):** KMP only. Managed exceptions + programmatic `reportError`. The two events (`deepdots_app_crash`, `deepdots_session_start`) are already in `docs/ANALYTICS-BACKEND-SPEC.md` from the Web plan; this plan only adds a small KMP-coverage note.

**Working directory:** `/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK` (stay on `main`). All source paths are under `shared/src/`.

---

## File Structure

- Create: `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.kt` — `CrashReporter`, `CrashRecord` (@Serializable), `DeviceSnapshot`, `crashRecordToParams`, and `expect fun installCrashHandlers(...)`.
- Create: `shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt` — actual install via `Thread.setDefaultUncaughtExceptionHandler`.
- Create: `shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt` — actual install via `NSSetUncaughtExceptionHandler`.
- Create: `shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/CrashReporterParityTest.kt` — core unit tests (parity with Web `crash-reporter.test.ts`).
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt` — field, `init()` wiring, public `reportError()`.
- Modify: `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt` — integration tests (session_start, reportError, replay, disabled path).
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md` (in the WEB repo `/Users/sarias/develop/deepdots-popup-sdk`) — one KMP-coverage note. (Optional/last; see Task 4.)

---

## Task 1: CrashReporter core in commonMain + unit tests

**Files:**
- Create: `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.kt`
- Create: `shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/CrashReporterParityTest.kt`

- [ ] **Step 1: Write the failing test**

Create `shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/CrashReporterParityTest.kt`:
```kotlin
package com.deepdots.sdk.analytics

import com.deepdots.sdk.storage.InMemoryStorage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Paridad con el CrashReporter Web (src/analytics/crash-reporter.test.ts). */
class CrashReporterParityTest {

    private fun reporter(
        storage: InMemoryStorage = InMemoryStorage(),
        emitted: MutableList<Map<String, Any?>> = mutableListOf(),
        enabled: Boolean = true,
    ) = CrashReporter(
        storage = storage,
        emit = { emitted.add(it) },
        device = { DeviceSnapshot(appVersion = "1.0.0", osVersion = "17.4", deviceModel = "iPhone14,3") },
        sessionId = { "sess-1" },
        now = { 1_000L },
        enabled = { enabled },
    )

    @Test
    fun report_error_emits_immediately_with_crash_time_context() {
        val emitted = mutableListOf<Map<String, Any?>>()
        val r = reporter(emitted = emitted)
        r.reportError(IllegalStateException("boom"), severity = "error", context = mapOf("screen" to "Checkout"))

        assertEquals(1, emitted.size)
        val p = emitted[0]
        assertEquals(1_000L, p["crashed_at"])
        assertEquals("IllegalStateException", p["crash_type"])
        assertEquals("boom", p["message"])
        assertEquals(false, p["fatal"])
        assertEquals(true, p["handled"])
        assertEquals("error", p["severity"])
        assertEquals("sess-1", p["crashed_session_id"])
        assertEquals("1.0.0", p["crashed_app_version"])
        assertEquals("17.4", p["crashed_os_version"])
        assertEquals("iPhone14,3", p["crashed_device_model"])
        assertEquals("Checkout", p["ctx_screen"])
    }

    @Test
    fun severity_fatal_marks_fatal_true() {
        val emitted = mutableListOf<Map<String, Any?>>()
        val r = reporter(emitted = emitted)
        r.reportError(RuntimeException("a"))
        r.reportError(RuntimeException("b"), severity = "fatal")
        assertEquals(false, emitted[0]["fatal"])
        assertEquals("error", emitted[0]["severity"])
        assertEquals(true, emitted[1]["fatal"])
        assertEquals("fatal", emitted[1]["severity"])
    }

    @Test
    fun disabled_is_a_no_op() {
        val emitted = mutableListOf<Map<String, Any?>>()
        val r = reporter(emitted = emitted, enabled = false)
        r.reportError(RuntimeException("x"))
        assertEquals(0, emitted.size)
    }

    @Test
    fun capture_unhandled_persists_and_drain_returns_and_clears() {
        val storage = InMemoryStorage()
        val r = reporter(storage = storage)
        r.captureUnhandled("NullPointerException", "npe", "stack-trace")
        r.captureUnhandled("RangeError", "oob", "")

        val drained = r.drainPendingCrashes()
        assertEquals(2, drained.size)
        assertEquals("npe", drained[0].message)
        assertEquals(true, drained[0].fatal)
        assertEquals(false, drained[0].handled)
        assertEquals("fatal", drained[0].severity)
        // segunda lectura ya vacía
        assertTrue(r.drainPendingCrashes().isEmpty())
    }

    @Test
    fun queue_caps_at_20_dropping_oldest() {
        val storage = InMemoryStorage()
        val r = reporter(storage = storage)
        for (i in 0 until 25) r.captureUnhandled("E", "e$i", "")
        val drained = r.drainPendingCrashes()
        assertEquals(20, drained.size)
        assertEquals("e5", drained[0].message)
        assertEquals("e24", drained[19].message)
    }

    @Test
    fun drain_tolerates_corrupt_storage() {
        val storage = InMemoryStorage()
        storage.putString("deepdots.crash.queue", "not json")
        val r = reporter(storage = storage)
        assertTrue(r.drainPendingCrashes().isEmpty())
    }

    @Test
    fun crash_record_to_params_omits_null_optionals() {
        val rec = CrashRecord(
            crashedAt = 5L, crashType = "Error", message = "m", stack = "", fatal = true,
            handled = false, severity = "fatal",
        )
        val p = crashRecordToParams(rec)
        assertNull(p["crashed_session_id"])
        assertNull(p["crashed_app_version"])
        assertEquals(5L, p["crashed_at"])
        assertEquals("Error", p["crash_type"])
        assertEquals(true, p["fatal"])
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD FAILED — unresolved references `CrashReporter`, `CrashRecord`, `DeviceSnapshot`, `crashRecordToParams`.

- [ ] **Step 3: Write the implementation**

Create `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.kt`:
```kotlin
package com.deepdots.sdk.analytics

import com.deepdots.sdk.storage.KeyValueStorage
import com.deepdots.sdk.util.currentTimeMillis
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Crash & error reporting (Stability #14–17) — captura de errores GESTIONADOS.
 * Espejo del SDK Web (src/analytics/crash-reporter.ts).
 *
 * - `reportError()`: API pública del host (app viva) → emite `deepdots_app_crash` ya.
 * - `captureUnhandled()`: lo llaman los handlers de plataforma (uncaught) → persiste a
 *   disco y se reenvía en el siguiente arranque (el proceso puede morir antes del flush).
 *
 * El contexto de device/sesión se captura EN EL MOMENTO del crash y se guarda en el record.
 */

@Serializable
data class CrashRecord(
    val crashedAt: Long,
    val crashType: String,
    val message: String,
    val stack: String,
    val fatal: Boolean,
    val handled: Boolean,
    val severity: String,
    val sessionId: String? = null,
    val appVersion: String? = null,
    val osVersion: String? = null,
    val deviceModel: String? = null,
    val context: Map<String, String>? = null,
)

/** Snapshot de device en el momento del crash. */
data class DeviceSnapshot(
    val appVersion: String? = null,
    val osVersion: String? = null,
    val deviceModel: String? = null,
)

private const val QUEUE_KEY = "deepdots.crash.queue"
private const val MAX_QUEUED = 20
private const val STACK_MAX = 8000

private val crashJson = Json { ignoreUnknownKeys = true }

/** Convierte un CrashRecord en los params del evento `deepdots_app_crash` (omite null). */
fun crashRecordToParams(r: CrashRecord): Map<String, Any?> {
    val params = LinkedHashMap<String, Any?>()
    params["crashed_at"] = r.crashedAt
    params["crash_type"] = r.crashType
    params["message"] = r.message
    params["stack"] = r.stack
    params["fatal"] = r.fatal
    params["handled"] = r.handled
    params["severity"] = r.severity
    r.sessionId?.let { params["crashed_session_id"] = it }
    r.appVersion?.let { params["crashed_app_version"] = it }
    r.osVersion?.let { params["crashed_os_version"] = it }
    r.deviceModel?.let { params["crashed_device_model"] = it }
    r.context?.forEach { (k, v) -> params["ctx_$k"] = v }
    return params
}

class CrashReporter(
    private val storage: KeyValueStorage,
    /** Emite un evento deepdots_app_crash AHORA (app viva). */
    private val emit: (Map<String, Any?>) -> Unit,
    /** Snapshot de device en el momento del crash. */
    private val device: () -> DeviceSnapshot,
    /** session_id en el momento del crash. */
    private val sessionId: () -> String?,
    private val now: () -> Long = { currentTimeMillis() },
    /** Kill-switch de consentimiento. */
    private val enabled: () -> Boolean = { true },
) {
    private fun buildRecord(
        crashType: String,
        message: String,
        stack: String,
        severity: String,
        handled: Boolean,
        fatal: Boolean,
        context: Map<String, String>? = null,
    ): CrashRecord {
        val dev = device()
        return CrashRecord(
            crashedAt = now(),
            crashType = crashType,
            message = message,
            stack = stack.take(STACK_MAX),
            fatal = fatal,
            handled = handled,
            severity = severity,
            sessionId = sessionId(),
            appVersion = dev.appVersion,
            osVersion = dev.osVersion,
            deviceModel = dev.deviceModel,
            context = context,
        )
    }

    /** API pública del host: reporta un error (app viva) → emite el evento ya. */
    fun reportError(
        error: Throwable,
        severity: String = "error",
        handled: Boolean = true,
        context: Map<String, Any?>? = null,
    ) {
        if (!enabled()) return
        val ctx = context?.mapValues { it.value.toString() }
        val record = buildRecord(
            crashType = error::class.simpleName ?: "Error",
            message = error.message ?: "",
            stack = error.stackTraceToString(),
            severity = severity,
            handled = handled,
            fatal = severity == "fatal",
            context = ctx,
        )
        emit(crashRecordToParams(record))
    }

    /** Lo llaman los handlers de plataforma para un crash no capturado (fatal). Persiste a disco. */
    fun captureUnhandled(crashType: String, message: String, stack: String) {
        persist(buildRecord(crashType, message, stack, severity = "fatal", handled = false, fatal = true))
    }

    private fun persist(record: CrashRecord) {
        var queue = readQueue() + record
        if (queue.size > MAX_QUEUED) queue = queue.takeLast(MAX_QUEUED)
        try {
            storage.putString(QUEUE_KEY, crashJson.encodeToString(queue))
        } catch (_: Throwable) {
            /* storage lleno / no disponible — no rompemos la app */
        }
    }

    /** Lee y vacía la cola de crashes pendientes (llamado en init para el replay). */
    fun drainPendingCrashes(): List<CrashRecord> {
        val queue = readQueue()
        if (queue.isNotEmpty()) {
            try { storage.remove(QUEUE_KEY) } catch (_: Throwable) { /* noop */ }
        }
        return queue
    }

    private fun readQueue(): List<CrashRecord> {
        val raw = try { storage.getString(QUEUE_KEY) } catch (_: Throwable) { null } ?: return emptyList()
        return try { crashJson.decodeFromString<List<CrashRecord>>(raw) } catch (_: Throwable) { emptyList() }
    }
}

/** Instala los handlers de errores no capturados de plataforma (managed). No-op si la plataforma no aplica. */
expect fun installCrashHandlers(reporter: CrashReporter, enabled: () -> Boolean)
```

- [ ] **Step 4: Add a temporary no-op actual so commonTest compiles**

`expect fun` needs actuals on every target to compile. For Task 1's unit tests (which never call `installCrashHandlers`), create minimal actuals now; Task 2 replaces them with real implementations.

Create `shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt`:
```kotlin
package com.deepdots.sdk.analytics

actual fun installCrashHandlers(reporter: CrashReporter, enabled: () -> Boolean) {
    // Reemplazado en la Task 2 por el Thread.setDefaultUncaughtExceptionHandler real.
}
```

Create `shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt`:
```kotlin
package com.deepdots.sdk.analytics

actual fun installCrashHandlers(reporter: CrashReporter, enabled: () -> Boolean) {
    // Reemplazado en la Task 2 por el NSSetUncaughtExceptionHandler real.
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD SUCCESSFUL (the 7 new tests pass alongside the existing suite).

- [ ] **Step 6: Verify iOS compiles**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew compileKotlinIosSimulatorArm64`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK
git add shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.kt \
  shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt \
  shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt \
  shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/CrashReporterParityTest.kt
git commit -m "Add CrashReporter core + queue + reportError in commonMain (KMP)"
```

---

## Task 2: Real managed actuals (Android + iOS)

**Files:**
- Modify: `shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt`
- Modify: `shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt`

> These install MANAGED uncaught-exception handlers only. They cannot be unit-tested (process-level); verification is compile + manual. Native signal capture (xCrash / PLCrashReporter) is a later plan.

- [ ] **Step 1: Android actual**

Replace the contents of `shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt` with:
```kotlin
package com.deepdots.sdk.analytics

/**
 * Captura de crashes GESTIONADOS en Android: uncaught exceptions de la JVM.
 * Encadena SIEMPRE al handler previo (no romper Crashlytics/Sentry del host).
 * Los crashes nativos (NDK/señales) se cubren en un plan posterior (xCrash).
 */
actual fun installCrashHandlers(reporter: CrashReporter, enabled: () -> Boolean) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        try {
            if (enabled()) {
                reporter.captureUnhandled(
                    crashType = throwable::class.simpleName ?: "Error",
                    message = throwable.message ?: "",
                    stack = throwable.stackTraceToString(),
                )
            }
        } catch (_: Throwable) {
            /* nunca interferir con la terminación del proceso */
        }
        previous?.uncaughtException(thread, throwable)
    }
}
```

- [ ] **Step 2: iOS actual**

Replace the contents of `shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt` with:
```kotlin
package com.deepdots.sdk.analytics

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.staticCFunction
import platform.Foundation.NSException
import platform.Foundation.NSSetUncaughtExceptionHandler

// staticCFunction no puede capturar estado local: el reporter y el flag de consentimiento
// viven en globals que el handler lee. (Las excepciones Obj-C/NSException son "managed";
// los crashes por señal (SIGSEGV/SIGABRT) requieren PLCrashReporter — plan posterior.)
private var iosCrashReporter: CrashReporter? = null
private var iosCrashEnabled: (() -> Boolean)? = null

@OptIn(ExperimentalForeignApi::class)
actual fun installCrashHandlers(reporter: CrashReporter, enabled: () -> Boolean) {
    iosCrashReporter = reporter
    iosCrashEnabled = enabled
    NSSetUncaughtExceptionHandler(
        staticCFunction { exception: NSException? ->
            val r = iosCrashReporter ?: return@staticCFunction
            if (iosCrashEnabled?.invoke() != true) return@staticCFunction
            val name = exception?.name ?: "NSException"
            val reason = exception?.reason ?: ""
            val stack = exception?.callStackSymbols?.joinToString("\n") { it.toString() } ?: ""
            r.captureUnhandled(crashType = name, message = reason, stack = stack)
        },
    )
}
```

- [ ] **Step 3: Verify both targets compile**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD SUCCESSFUL (Android compiles + existing tests pass).

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew compileKotlinIosSimulatorArm64`
Expected: BUILD SUCCESSFUL.

> If `staticCFunction`/`NSSetUncaughtExceptionHandler` produce a type error, do NOT guess — report BLOCKED with the exact compiler message. The expected signature is `NSSetUncaughtExceptionHandler(handler: CPointer<CFunction<(NSException?) -> Unit>>?)` and `staticCFunction { exception: NSException? -> ... }` satisfies it.

- [ ] **Step 4: Commit**

```bash
cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK
git add shared/src/androidMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.android.kt \
  shared/src/iosMain/kotlin/com/deepdots/sdk/analytics/CrashReporter.ios.kt
git commit -m "Add managed crash handlers: Android UncaughtExceptionHandler, iOS NSSetUncaughtExceptionHandler"
```

---

## Task 3: Wire CrashReporter into DeepdotsPopups + public reportError + session_start + replay

**Files:**
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt`
- Modify: `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`

Read the `init()` method of `DeepdotsPopups.kt` first. Key facts:
- `analytics = AnalyticsManager(...)` is created with `device = com.deepdots.sdk.analytics.collectDeviceInfo()`.
- The local `val storage` is resolved earlier (`options.storage ?: createDefaultStorage()`, also assigned to `resolvedStorage`).
- `track(name, params)` gates on `tracking?.isTrackingEnabled()`.
- `getPlatform()`, `currentTimeMillis()` available; `DeviceInfo` props are camelCase (`appVersion`, `osVersion`, `deviceModel`).
- There is a public method region "Analytics (canal separado…)" with `track`, `setUserAttributes`, etc.

- [ ] **Step 1: Write the failing test**

In `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`, add these imports near the top (the file already imports `InMemoryStorage`, `InitOptions`, `PopupOptions`, `jsonPrimitive`):
```kotlin
import com.deepdots.sdk.analytics.CrashReporter
import com.deepdots.sdk.analytics.DeviceSnapshot
import kotlinx.serialization.json.long
import kotlin.test.assertNull
```
Then append these tests to the class:
```kotlin
    @Test
    fun emits_session_start_at_init_and_app_crash_on_report_error() {
        val s = sdk()
        val names0 = s.previewAnalytics().events.map { it.name }
        assertTrue(names0.contains("deepdots_session_start"))

        s.reportError(IllegalStateException("kaboom"), severity = "error", context = mapOf("screen" to "Home"))
        val crash = s.previewAnalytics().events.first { it.name == "deepdots_app_crash" }
        assertEquals("IllegalStateException", crash.params?.get("crash_type")?.jsonPrimitive?.content)
        assertEquals("kaboom", crash.params?.get("message")?.jsonPrimitive?.content)
        assertEquals("Home", crash.params?.get("ctx_screen")?.jsonPrimitive?.content)
    }

    @Test
    fun replays_pending_crashes_from_disk_at_init() {
        val storage = InMemoryStorage()
        // Siembra un crash usando un CrashReporter sobre el mismo storage.
        val seeder = CrashReporter(
            storage = storage,
            emit = {},
            device = { DeviceSnapshot(appVersion = "0.9.0") },
            sessionId = { null },
            now = { 111L },
        )
        seeder.captureUnhandled("RangeError", "old crash", "")

        val s = DeepdotsPopups().apply {
            init(InitOptions(debug = true, popupOptions = PopupOptions(publicKey = "pk-1"), storage = storage))
        }
        val crash = s.previewAnalytics().events.first { it.name == "deepdots_app_crash" }
        assertEquals(111L, crash.params?.get("crashed_at")?.jsonPrimitive?.long)
        assertEquals("RangeError", crash.params?.get("crash_type")?.jsonPrimitive?.content)
        assertEquals("0.9.0", crash.params?.get("crashed_app_version")?.jsonPrimitive?.content)
        // la cola quedó vacía tras el replay
        assertNull(storage.getString("deepdots.crash.queue"))
    }

    @Test
    fun disabled_tracking_emits_no_session_start_nor_crash() {
        val s = DeepdotsPopups().apply {
            init(InitOptions(debug = true, popupOptions = PopupOptions(publicKey = "pk-1"), storage = InMemoryStorage(), trackingEnabled = false))
        }
        s.reportError(RuntimeException("x"))
        val names = s.previewAnalytics().events.map { it.name }
        assertTrue(!names.contains("deepdots_session_start"))
        assertTrue(!names.contains("deepdots_app_crash"))
    }
```

> If `InitOptions` does not have a `trackingEnabled` parameter, check its definition and use the correct name (the Web/KMP contract added `trackingEnabled` to init; it should exist). If it genuinely doesn't, report NEEDS_CONTEXT rather than guessing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD FAILED — `reportError` unresolved, no `deepdots_session_start`/`deepdots_app_crash` events.

- [ ] **Step 3: Add field + import in `DeepdotsPopups.kt`**

Add the import near the other analytics imports:
```kotlin
import com.deepdots.sdk.analytics.CrashReporter
import com.deepdots.sdk.analytics.DeviceSnapshot
import com.deepdots.sdk.analytics.crashRecordToParams
import com.deepdots.sdk.analytics.installCrashHandlers
```
Add the field next to the other analytics fields (after `analyticsFeedbackSessionId`):
```kotlin
    /** Crash & error reporting (#14–17). Null hasta init(). */
    private var crashReporter: CrashReporter? = null
```

- [ ] **Step 4: Wire creation in `init()`**

The analytics manager is created with `device = com.deepdots.sdk.analytics.collectDeviceInfo()`. Refactor to capture the device once and build the crash reporter right after. Replace:
```kotlin
        analytics = AnalyticsManager(
            sink = analyticsSink ?: com.deepdots.sdk.analytics.dryRunSink,
            publicKey = analyticsKeys?.publicKey ?: options.popupOptions.publicKey,
            platform = if (getPlatform().name.startsWith("iOS", ignoreCase = true)) "ios" else "android",
            language = options.provideLang.invoke(),
            device = com.deepdots.sdk.analytics.collectDeviceInfo(),
            maxBatchSize = ANALYTICS_MAX_BATCH_SIZE,
            onFlushNeeded = { flushAnalytics() },
        )
```
with:
```kotlin
        val device = com.deepdots.sdk.analytics.collectDeviceInfo()
        analytics = AnalyticsManager(
            sink = analyticsSink ?: com.deepdots.sdk.analytics.dryRunSink,
            publicKey = analyticsKeys?.publicKey ?: options.popupOptions.publicKey,
            platform = if (getPlatform().name.startsWith("iOS", ignoreCase = true)) "ios" else "android",
            language = options.provideLang.invoke(),
            device = device,
            maxBatchSize = ANALYTICS_MAX_BATCH_SIZE,
            onFlushNeeded = { flushAnalytics() },
        )
        // Crash & error reporting (#14–17): captura uncaught (a disco, replay en el siguiente
        // arranque) y expone reportError() para el host (emite ya).
        val crash = CrashReporter(
            storage = storage,
            emit = { params -> track("deepdots_app_crash", params) },
            device = { DeviceSnapshot(appVersion = device.appVersion, osVersion = device.osVersion, deviceModel = device.deviceModel) },
            sessionId = { tracking?.getSessionId() },
            now = { currentTimeMillis() },
            enabled = { tracking?.isTrackingEnabled() == true },
        )
        crashReporter = crash
        if (tracking?.isTrackingEnabled() == true) {
            installCrashHandlers(crash) { tracking?.isTrackingEnabled() == true }
        }
        // Marca de inicio de sesión (base para Crash-Free Users #14).
        track("deepdots_session_start", emptyMap())
        // Drena SIEMPRE la cola (descarta pendientes si tracking off); solo reenvía si activo.
        val pendingCrashes = crash.drainPendingCrashes()
        if (tracking?.isTrackingEnabled() == true) {
            for (rec in pendingCrashes) track("deepdots_app_crash", crashRecordToParams(rec))
        }
```

> Use the local `storage` already resolved in `init()` (`options.storage ?: createDefaultStorage()`). If that local has a different name in the current code, use whatever local holds the resolved `KeyValueStorage` (it is also assigned to `resolvedStorage`).

- [ ] **Step 5: Add the public `reportError` method**

Add to the public Analytics region (e.g. right after `setUserAttributes`):
```kotlin
    /** Reporta un error del host (manejado o no) → evento `deepdots_app_crash`. No-op si tracking off. */
    fun reportError(
        error: Throwable,
        severity: String = "error",
        handled: Boolean = true,
        context: Map<String, Any?>? = null,
    ) {
        if (tracking?.isTrackingEnabled() != true) return
        crashReporter?.reportError(error, severity, handled, context)
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD SUCCESSFUL (existing + 3 new integration tests).

- [ ] **Step 7: Verify iOS compiles**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew compileKotlinIosSimulatorArm64`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK
git add shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt \
  shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt
git commit -m "Wire CrashReporter into KMP SDK: reportError, session_start, crash replay"
```

---

## Task 4: Note KMP coverage in the backend spec

**Files:**
- Modify (WEB repo): `/Users/sarias/develop/deepdots-popup-sdk/docs/ANALYTICS-BACKEND-SPEC.md`

- [ ] **Step 1: Add a KMP-coverage note under the `deepdots_app_crash` documentation**

The event is already documented (from the Web plan). Immediately after the `deepdots_app_crash` field table, add:
```markdown
> **Cobertura por plataforma:** Web captura errores JS no manejados (`window.onerror` / `unhandledrejection`) y `reportError()`. KMP captura excepciones gestionadas — Android `Thread.UncaughtExceptionHandler` (JVM), iOS `NSSetUncaughtExceptionHandler` (NSException) — y `reportError()`. En KMP `crashed_os_version`/`crashed_device_model` van poblados de forma nativa; en Web suelen ir vacíos. Los crashes nativos por señal (NDK / Mach) requieren captura nativa dedicada (plan posterior).
```

- [ ] **Step 2: Commit**

```bash
cd /Users/sarias/develop/deepdots-popup-sdk
git add docs/ANALYTICS-BACKEND-SPEC.md
git commit -m "Docs: note KMP crash-capture coverage"
```

---

## Notas y limitaciones conocidas

- **Durabilidad en Android:** la cola se persiste vía `KeyValueStorage` (SharedPreferences). Si el impl usa `apply()` (async), una escritura desde el uncaught handler puede no completarse antes de la muerte del proceso. Para crashes fatales conviene un guardado síncrono (`commit()`); queda como refinamiento (posible en el plan nativo). El camino `reportError` (app viva) no se ve afectado: emite por el canal de analytics de inmediato.
- **iOS managed-only:** `NSSetUncaughtExceptionHandler` solo captura `NSException` (Obj-C). Los crashes por señal (SIGSEGV/SIGABRT) y los Kotlin/Native fatal errors no pasan por ahí — los cubre el plan nativo (PLCrashReporter).
- **`staticCFunction` + globals (iOS):** el handler no puede capturar estado; usa `iosCrashReporter`/`iosCrashEnabled` globales. Es seguro porque `init()` corre una sola vez (guardado por `initialized`).
- Paridad con Web: mismas claves de evento, mismo cap (20), mismo gating por `trackingEnabled`, misma captura de contexto en el momento del crash. Tests de paridad: `CrashReporterParityTest` (KMP) ≈ `crash-reporter.test.ts` (Web).
