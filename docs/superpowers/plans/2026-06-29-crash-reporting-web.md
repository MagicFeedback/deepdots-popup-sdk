# Crash Reporting (Web, managed errors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add managed-error crash reporting to the Web/JS SDK: a `CrashReporter` that captures unhandled JS errors (persisted to disk and replayed next launch) and a public `reportError()` API for host-reported errors (emitted immediately), all surfaced as `deepdots_app_crash` analytics events, plus a `deepdots_session_start` marker for crash-free computation.

**Architecture:** New isolated `CrashReporter` class (`src/analytics/crash-reporter.ts`) with one responsibility: build crash records, persist/drain a disk queue (via the existing `KeyValueStorage`), expose `reportError`, and install `window` handlers. It is decoupled from `AnalyticsManager` via an injected `emit` callback. `DeepdotsPopups.init()` wires it: installs handlers, emits `deepdots_session_start`, and replays pending crashes through the analytics channel. Device/session context is captured AT CRASH TIME and stored in the record (not read from the live envelope at replay), so a crash on an old app version still reports the version it crashed on.

**Tech Stack:** TypeScript + vitest. No native dependencies (managed JS errors only; native signal capture is a later plan).

**Scope (this plan):** Web only. Managed errors only (`window.onerror`, `window.onunhandledrejection`, programmatic `reportError`). KMP parity and native-library capture are separate plans.

---

## File Structure

- Create: `src/analytics/crash-reporter.ts` — the `CrashReporter` class, `CrashRecord` model, `crashRecordToParams` mapper, types. One responsibility: crash capture + disk queue.
- Create: `src/analytics/crash-reporter.test.ts` — unit tests with injected storage/emit/clock.
- Modify: `src/core/deepdots-popups.ts` — field, `init()` wiring (create + install + session_start + replay), public `reportError()` method.
- Modify: `src/core/deepdots-popups.analytics.test.ts` — integration tests (reportError → event, session_start at init, replay from seeded storage).
- Modify: `src/index.ts` — export `CrashReporter` and types.
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md` — document `deepdots_app_crash` + `deepdots_session_start`.

---

## Task 1: CrashReporter — record building + reportError (immediate emit)

**Files:**
- Create: `src/analytics/crash-reporter.ts`
- Create: `src/analytics/crash-reporter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/analytics/crash-reporter.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { CrashReporter, crashRecordToParams, type CrashRecord } from './crash-reporter';
import { InMemoryStorage } from '../tracking/tracking-manager';

function make(overrides: Partial<{ enabled: boolean }> = {}) {
  const emit = vi.fn();
  const storage = new InMemoryStorage();
  const reporter = new CrashReporter({
    storage,
    emit,
    device: () => ({ appVersion: '1.0.0', osVersion: '17.4', deviceModel: 'iPhone14,3' }),
    sessionId: () => 'sess-1',
    now: () => 1_000,
    enabled: () => overrides.enabled ?? true,
  });
  return { reporter, emit, storage };
}

describe('CrashReporter.reportError', () => {
  it('emits a deepdots_app_crash payload immediately with crash-time context', () => {
    const { reporter, emit } = make();
    reporter.reportError(new TypeError('boom'), { severity: 'error', context: { screen: 'Checkout', order_id: 'o-42' } });

    expect(emit).toHaveBeenCalledTimes(1);
    const params = emit.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      crashed_at: 1000,
      crash_type: 'TypeError',
      message: 'boom',
      fatal: false,
      handled: true,
      severity: 'error',
      crashed_session_id: 'sess-1',
      crashed_app_version: '1.0.0',
      crashed_os_version: '17.4',
      crashed_device_model: 'iPhone14,3',
      ctx_screen: 'Checkout',
      ctx_order_id: 'o-42',
    });
    expect(typeof params.stack).toBe('string');
  });

  it('defaults severity=error/handled=true and marks fatal only when severity=fatal', () => {
    const { reporter, emit } = make();
    reporter.reportError(new Error('a'));
    reporter.reportError(new Error('b'), { severity: 'fatal' });
    expect((emit.mock.calls[0][0] as any).severity).toBe('error');
    expect((emit.mock.calls[0][0] as any).fatal).toBe(false);
    expect((emit.mock.calls[1][0] as any).severity).toBe('fatal');
    expect((emit.mock.calls[1][0] as any).fatal).toBe(true);
  });

  it('accepts a string error and is a no-op when disabled', () => {
    const { reporter, emit } = make({ enabled: false });
    reporter.reportError('plain string');
    expect(emit).not.toHaveBeenCalled();
  });

  it('crashRecordToParams omits undefined optional fields', () => {
    const rec: CrashRecord = {
      crashedAt: 5, crashType: 'Error', message: 'm', stack: '', fatal: true,
      handled: false, severity: 'fatal', sessionId: null,
    };
    const params = crashRecordToParams(rec);
    expect(params).not.toHaveProperty('crashed_session_id');
    expect(params).not.toHaveProperty('crashed_app_version');
    expect(params).toMatchObject({ crashed_at: 5, crash_type: 'Error', fatal: true, handled: false, severity: 'fatal' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: FAIL — `Cannot find module './crash-reporter'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/analytics/crash-reporter.ts`:
```typescript
/**
 * Crash & error reporting (Stability #14–17) — captura de errores GESTIONADOS.
 *
 * - `reportError()`: API pública para el host (app viva) → emite `deepdots_app_crash` ya.
 * - handlers de `window` (errores no capturados): persisten a disco y se reenvían
 *   en el siguiente arranque (el proceso puede morir antes del flush normal).
 *
 * El contexto de device/sesión se captura EN EL MOMENTO del crash y se guarda en el
 * record — no se lee del envelope en el replay (el replay puede ocurrir en otra
 * app_version/OS). Las dims OS/device en Web suelen ir vacías (se derivan del UA en backend).
 */

import type { KeyValueStorage } from '../tracking/tracking-manager';

export type CrashSeverity = 'fatal' | 'error' | 'warning';

export interface CrashRecord {
  crashedAt: number;
  crashType: string;
  message: string;
  stack: string;
  fatal: boolean;
  handled: boolean;
  severity: CrashSeverity;
  sessionId: string | null;
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  context?: Record<string, string>;
}

export interface ReportErrorOptions {
  severity?: CrashSeverity;
  handled?: boolean;
  context?: Record<string, unknown>;
}

export interface DeviceSnapshot {
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
}

export interface CrashReporterOptions {
  storage: KeyValueStorage;
  /** Emite un evento deepdots_app_crash AHORA (app viva). */
  emit: (params: Record<string, unknown>) => void;
  /** Snapshot de device en el momento del crash. */
  device: () => DeviceSnapshot;
  /** session_id en el momento del crash. */
  sessionId: () => string | null;
  now?: () => number;
  /** Kill-switch de consentimiento. */
  enabled?: () => boolean;
}

const STACK_MAX = 8000;

/** Convierte un CrashRecord en los params del evento `deepdots_app_crash` (omite undefined). */
export function crashRecordToParams(r: CrashRecord): Record<string, unknown> {
  const params: Record<string, unknown> = {
    crashed_at: r.crashedAt,
    crash_type: r.crashType,
    message: r.message,
    stack: r.stack,
    fatal: r.fatal,
    handled: r.handled,
    severity: r.severity,
  };
  if (r.sessionId) params.crashed_session_id = r.sessionId;
  if (r.appVersion) params.crashed_app_version = r.appVersion;
  if (r.osVersion) params.crashed_os_version = r.osVersion;
  if (r.deviceModel) params.crashed_device_model = r.deviceModel;
  if (r.context) {
    for (const [k, v] of Object.entries(r.context)) params[`ctx_${k}`] = v;
  }
  return params;
}

export class CrashReporter {
  private options: CrashReporterOptions;
  private now: () => number;

  constructor(options: CrashReporterOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
  }

  private isEnabled(): boolean {
    return this.options.enabled ? this.options.enabled() : true;
  }

  /** Construye un CrashRecord capturando contexto en el momento del crash. */
  private buildRecord(
    error: unknown,
    severity: CrashSeverity,
    handled: boolean,
    fatal: boolean,
    context?: Record<string, unknown>,
  ): CrashRecord {
    const err = error as { name?: string; message?: string; stack?: string };
    const isErr = error instanceof Error;
    const dev = this.options.device();
    const ctx = context
      ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)]))
      : undefined;
    return {
      crashedAt: this.now(),
      crashType: (isErr && err.name) || 'Error',
      message: isErr ? String(err.message ?? '') : String(error),
      stack: (isErr && typeof err.stack === 'string' ? err.stack : '').slice(0, STACK_MAX),
      fatal,
      handled,
      severity,
      sessionId: this.options.sessionId(),
      appVersion: dev.appVersion,
      osVersion: dev.osVersion,
      deviceModel: dev.deviceModel,
      context: ctx,
    };
  }

  /** API pública del host: reporta un error (app viva) → emite el evento ya. */
  reportError(error: unknown, options: ReportErrorOptions = {}): void {
    if (!this.isEnabled()) return;
    const severity = options.severity ?? 'error';
    const handled = options.handled ?? true;
    const fatal = severity === 'fatal';
    const record = this.buildRecord(error, severity, handled, fatal, options.context);
    this.options.emit(crashRecordToParams(record));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/crash-reporter.ts src/analytics/crash-reporter.test.ts
git commit -m "Add CrashReporter core: reportError + deepdots_app_crash mapping (Web)"
```

---

## Task 2: CrashReporter — disk queue + window handlers (persist & replay)

**Files:**
- Modify: `src/analytics/crash-reporter.ts`
- Modify: `src/analytics/crash-reporter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/analytics/crash-reporter.test.ts`:
```typescript
describe('CrashReporter disk queue', () => {
  it('persist() appends records; drainPendingCrashes() returns and clears them', () => {
    const emit = vi.fn();
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit,
      device: () => ({ appVersion: '1.0.0' }),
      sessionId: () => 'sess-1',
      now: () => 2_000,
      enabled: () => true,
    });

    // simula dos crashes no capturados persistidos
    reporter.persistForTest(new Error('first'));
    reporter.persistForTest(new Error('second'));

    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(2);
    expect(drained[0].message).toBe('first');
    expect(drained[0].fatal).toBe(true);
    expect(drained[0].handled).toBe(false);
    expect(drained[0].severity).toBe('fatal');
    // segunda lectura ya está vacía
    expect(reporter.drainPendingCrashes()).toEqual([]);
  });

  it('caps the queue at 20 records, dropping the oldest', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => true,
    });
    for (let i = 0; i < 25; i++) reporter.persistForTest(new Error(`e${i}`));
    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(20);
    expect(drained[0].message).toBe('e5'); // los 5 más viejos se descartaron
    expect(drained[19].message).toBe('e24');
  });

  it('drainPendingCrashes tolerates corrupt storage (returns empty)', () => {
    const storage = new InMemoryStorage();
    storage.setItem('deepdots.crash.queue', 'not json');
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => true,
    });
    expect(reporter.drainPendingCrashes()).toEqual([]);
  });
});
```

> `persistForTest` is a thin test seam around the private persist path (the real persist is invoked from the `window` handlers, which aren't exercisable in vitest's environment).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: FAIL — `reporter.persistForTest is not a function` / `drainPendingCrashes is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/analytics/crash-reporter.ts`, add the queue constants near `STACK_MAX`:
```typescript
const QUEUE_KEY = 'deepdots.crash.queue';
const MAX_QUEUED = 20;
```

Add these methods to the `CrashReporter` class (after `reportError`):
```typescript
  /** Persiste un crash no capturado a disco para reenviarlo en el siguiente arranque. */
  private persist(record: CrashRecord): void {
    let queue: CrashRecord[] = [];
    try {
      const raw = this.options.storage.getItem(QUEUE_KEY);
      if (raw) queue = JSON.parse(raw) as CrashRecord[];
      if (!Array.isArray(queue)) queue = [];
    } catch {
      queue = [];
    }
    queue.push(record);
    if (queue.length > MAX_QUEUED) queue = queue.slice(queue.length - MAX_QUEUED);
    try {
      this.options.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      /* storage lleno / no disponible — se pierde el crash, no rompemos la app */
    }
  }

  /** Lee y vacía la cola de crashes pendientes (llamado en init para el replay). */
  drainPendingCrashes(): CrashRecord[] {
    let queue: CrashRecord[] = [];
    try {
      const raw = this.options.storage.getItem(QUEUE_KEY);
      if (raw) queue = JSON.parse(raw) as CrashRecord[];
      if (!Array.isArray(queue)) queue = [];
    } catch {
      queue = [];
    }
    if (queue.length) {
      try { this.options.storage.removeItem(QUEUE_KEY); } catch { /* noop */ }
    }
    return queue;
  }

  /** Instala los handlers globales de errores no capturados (no-op sin `window`). */
  install(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e: ErrorEvent) => {
      if (!this.isEnabled()) return;
      const err = e.error ?? e.message ?? 'error';
      this.persist(this.buildRecord(err, 'fatal', false, true));
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!this.isEnabled()) return;
      this.persist(this.buildRecord(e.reason ?? 'unhandledrejection', 'fatal', false, true));
    });
  }

  /** Test seam: ejercita el camino de persistencia (window handlers no son testeables en vitest). */
  persistForTest(error: unknown): void {
    this.persist(this.buildRecord(error, 'fatal', false, true));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/crash-reporter.ts src/analytics/crash-reporter.test.ts
git commit -m "Add CrashReporter disk queue + window handlers (Web)"
```

---

## Task 3: Wire CrashReporter into DeepdotsPopups + public reportError + session_start + replay

**Files:**
- Modify: `src/core/deepdots-popups.ts`
- Modify: `src/core/deepdots-popups.analytics.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

First add the `InMemoryStorage` import at the top of `src/core/deepdots-popups.analytics.test.ts` (the file already imports `NoopPopupRenderer` from `../platform/renderer`):
```typescript
import { InMemoryStorage } from '../tracking/tracking-manager';
```

Then append these two tests inside the top-level `describe(...)` block. They construct their own SDK instances following the exact pattern used elsewhere in this file (`new DeepdotsPopups()` → `setRenderer(new NoopPopupRenderer())` → `init(...)`), and read the buffer via the existing `previewAnalytics()`:
```typescript
  it('emite deepdots_session_start al init y deepdots_app_crash en reportError', () => {
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1' });

    // session_start presente tras init
    const names0 = sdk.previewAnalytics().events.map((e) => e.name);
    expect(names0).toContain('deepdots_session_start');

    sdk.reportError(new TypeError('kaboom'), { severity: 'error', context: { screen: 'Home' } });
    const crash = sdk.previewAnalytics().events.find((e) => e.name === 'deepdots_app_crash');
    expect(crash?.params).toMatchObject({
      crash_type: 'TypeError', message: 'kaboom', severity: 'error', handled: true, ctx_screen: 'Home',
    });
  });

  it('reenvía crashes pendientes de disco en init (replay → deepdots_app_crash)', () => {
    const storage = new InMemoryStorage();
    const pending = [{
      crashedAt: 111, crashType: 'RangeError', message: 'old crash', stack: '', fatal: true,
      handled: false, severity: 'fatal', sessionId: null, appVersion: '0.9.0',
    }];
    storage.setItem('deepdots.crash.queue', JSON.stringify(pending));

    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({ apiKey: 'pk-1', storage });

    const crash = sdk.previewAnalytics().events.find((e) => e.name === 'deepdots_app_crash');
    expect(crash?.params).toMatchObject({
      crashed_at: 111, crash_type: 'RangeError', crashed_app_version: '0.9.0', fatal: true,
    });
    // la cola quedó vacía tras el replay
    expect(storage.getItem('deepdots.crash.queue')).toBeNull();
  });
```

> `previewAnalytics()` already exists on `DeepdotsPopups` and returns the buffered envelope without sending. `localStorage.clear()` runs in the file's `beforeEach`, so the default-storage instance starts clean.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/deepdots-popups.analytics.test.ts`
Expected: FAIL — `popups.reportError is not a function` and no `deepdots_session_start`/`deepdots_app_crash` events.

- [ ] **Step 3: Add the import and field in `src/core/deepdots-popups.ts`**

Add to the import block near the other analytics imports (after the `EngagementTracker` import line):
```typescript
import { CrashReporter, type ReportErrorOptions } from '../analytics/crash-reporter';
```

Add the field next to the other analytics fields (after `analyticsFlushTimer`):
```typescript
    /** Crash & error reporting (#14–17). Null hasta init(). */
    private crashReporter: CrashReporter | null = null;
```

- [ ] **Step 4: Wire creation in `init()`**

In `init()`, the device is currently computed inline in the `AnalyticsManager` construction (`device: config.device ?? collectDeviceInfo(config.appVersion)`). Refactor to a local so both managers share it. Replace:
```typescript
        this.analytics = new AnalyticsManager({
            sink: analyticsSink,
            publicKey: config.analytics?.publicKey ?? this.config.apiKey,
            language: typeof navigator !== 'undefined' ? navigator.language : undefined,
            platform: config.platform ?? 'web',
            device: config.device ?? collectDeviceInfo(config.appVersion),
            maxBatchSize: ANALYTICS_MAX_BATCH_SIZE,
            onFlushNeeded: () => this.flushAnalytics(),
        });
```
with:
```typescript
        const device = config.device ?? collectDeviceInfo(config.appVersion);
        this.analytics = new AnalyticsManager({
            sink: analyticsSink,
            publicKey: config.analytics?.publicKey ?? this.config.apiKey,
            language: typeof navigator !== 'undefined' ? navigator.language : undefined,
            platform: config.platform ?? 'web',
            device,
            maxBatchSize: ANALYTICS_MAX_BATCH_SIZE,
            onFlushNeeded: () => this.flushAnalytics(),
        });
        // Crash & error reporting (#14–17): captura errores no manejados (a disco, replay
        // en el siguiente arranque) y expone reportError() para el host (emite ya).
        this.crashReporter = new CrashReporter({
            storage,
            emit: (params) => this.track('deepdots_app_crash', params),
            device: () => ({ appVersion: device.app_version, osVersion: device.os_version, deviceModel: device.device_model }),
            sessionId: () => this.tracking?.getSessionId() ?? null,
            now: () => Date.now(),
            enabled: () => this.tracking?.isTrackingEnabled() ?? false,
        });
        this.crashReporter.install();
```

Then, immediately AFTER the existing `this.setupAnalyticsFlush();` line, add the session_start marker and the crash replay:
```typescript
        // Marca de inicio de sesión (base para Crash-Free Users #14).
        this.track('deepdots_session_start', {});
        // Reenvía los crashes persistidos en sesiones anteriores.
        if (this.tracking?.isTrackingEnabled()) {
            for (const rec of this.crashReporter.drainPendingCrashes()) {
                this.track('deepdots_app_crash', crashRecordToParams(rec));
            }
        }
```
Add `crashRecordToParams` to the import you created in Step 3:
```typescript
import { CrashReporter, crashRecordToParams, type ReportErrorOptions } from '../analytics/crash-reporter';
```

- [ ] **Step 5: Add the public `reportError` method**

Add next to the other analytics public methods (e.g. right after `setUserAttributes`):
```typescript
    /** Reporta un error del host (manejado o no) → evento `deepdots_app_crash`. No-op si tracking off. */
    reportError(error: unknown, options?: ReportErrorOptions): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.crashReporter?.reportError(error, options);
    }
```

- [ ] **Step 6: Export from `src/index.ts`**

Add:
```typescript
export { CrashReporter, crashRecordToParams } from './analytics/crash-reporter';
export type { CrashRecord, CrashSeverity, ReportErrorOptions, DeviceSnapshot } from './analytics/crash-reporter';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/core/deepdots-popups.analytics.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 8: Run the full suite + build**

Run: `npm test`
Expected: PASS (preexisting unrelated `renderPopup.inject-style.test.ts` failure may appear; ignore it).

Run: `npm run build`
Expected: build + d.ts succeed (no type errors from the new exports).

- [ ] **Step 9: Commit**

```bash
git add src/core/deepdots-popups.ts src/core/deepdots-popups.analytics.test.ts src/index.ts
git commit -m "Wire CrashReporter into SDK: reportError, session_start, crash replay (Web)"
```

---

## Task 4: Document the new events in the backend spec

**Files:**
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md`

- [ ] **Step 1: Add the two events to the catalogue (section 3, "Eventos automáticos del SDK")**

After the `deepdots_mini_service_exit` subsection, add:
```markdown
#### `deepdots_session_start`
Se emite una vez al `init()`. Base para Crash-Free Users (#14).
```json
{ "timestamp": 1750000000000 }
```

#### `deepdots_app_crash`
Crash o error reportado. Los crashes no capturados se persisten a disco y se reenvían en el siguiente arranque; los `reportError()` del host se emiten en el momento.
```json
{
  "crashed_at": 1750000000000,
  "crash_type": "TypeError",
  "message": "Cannot read properties of undefined",
  "stack": "<texto truncado ~8KB>",
  "fatal": true,
  "handled": false,
  "severity": "fatal",
  "crashed_session_id": "abc-123",
  "crashed_app_version": "1.0.0",
  "crashed_os_version": "17.4",
  "crashed_device_model": "iPhone14,3",
  "ctx_screen": "CheckoutScreen"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `crashed_at` | number (ms) | Momento REAL del crash (≠ envío; el replay ocurre en el siguiente arranque). El backend usa este |
| `crash_type` | string | Clase de error o señal. Dimensión "Error" de #16 |
| `message` / `stack` | string | Mensaje y stack (sin simbolizar; truncado) |
| `fatal` | boolean | `true` si tumbó la app |
| `handled` | boolean | `true` si vino por `reportError`, `false` si fue no capturado |
| `severity` | string | `fatal` \| `error` \| `warning` |
| `crashed_session_id` | string? | Sesión en la que ocurrió |
| `crashed_app_version` / `crashed_os_version` / `crashed_device_model` | string? | Capturados EN EL MOMENTO del crash (no del envelope, que refleja el estado actual). Base de #15/#16 |
| `ctx_*` | string | Contexto libre del host pasado a `reportError` |
```

- [ ] **Step 2: Add the derived-metrics note (section 10, "Notas de implementación" or the metrics section)**

Add a bullet:
```markdown
- **Stability (#14–17)** se derivan de estos eventos: **#14 Crash-Free Users** = 1 − (sesiones con `deepdots_app_crash` / sesiones con `deepdots_session_start`); **#15 Latest Release** = crashes filtrados por el `crashed_app_version` más reciente (del propio evento); **#16 Breakdown** = group by `crash_type` × `crashed_os_version` × `crashed_device_model` × `crashed_app_version`; **#17 Summary** = totales. La simbolización del stack (dSYM / mapping) es responsabilidad de backend + pipeline de build, no del SDK.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ANALYTICS-BACKEND-SPEC.md
git commit -m "Docs: document deepdots_app_crash + deepdots_session_start events"
```

---

## Notas

- El fallo preexistente de `src/ui/renderPopup.inject-style.test.ts` es ajeno; no bloquea.
- `reportError` (app viva) emite el evento de inmediato; los handlers de `window` persisten a disco y se reenvían en el siguiente `init()`. Esta asimetría es intencional: un crash no capturado puede matar el proceso antes del flush.
- En Web, `crashed_os_version`/`crashed_device_model` suelen ir vacíos (se derivan del UA en backend); `crashed_app_version` viene de `init({ appVersion })`. En KMP (plan siguiente) van poblados de forma nativa.
- Siguiente plan: **Plan 3 — paridad KMP commonMain + actuals gestionados** (Android `Thread.setDefaultUncaughtExceptionHandler`, iOS `NSSetUncaughtExceptionHandler`), misma forma de `CrashReporter`, `reportError`, cola en disco (`KeyValueStorage`), replay y `deepdots_session_start`.
