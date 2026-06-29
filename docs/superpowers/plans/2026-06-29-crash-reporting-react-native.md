# Crash Reporting (React Native JS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture unhandled JS errors in React Native (which has no `window`) so RN apps get the same automatic `deepdots_app_crash` capture as web/native — via `global.ErrorUtils.setGlobalHandler`, wired through `setupReactNative`.

**Architecture:** Extend the existing `CrashReporter` with a public `captureUnhandled(error)` (DRY refactor of the window-handler path) and an `installReactNative(errorUtils)` that hooks `ErrorUtils.setGlobalHandler`, persists the crash, and chains to the previous handler. `DeepdotsPopups` exposes `installReactNativeCrashHandler(errorUtils)` (gated by tracking). `setupReactNative` calls it using an injected `errorUtils` dep or the `global.ErrorUtils` fallback. Persisted crashes replay on next launch through the existing `init()` drain path (RN storage is MMKV — synchronous, so persistence survives a JS crash). No native libraries.

**Tech Stack:** TypeScript + vitest. Pure JS — no native modules (native signal capture is parked).

**Scope (this plan):** RN JS-level managed crash capture only. `reportError()` already works in RN (plain method call). Native RN crashes (under iOS/Android) are NOT covered here — that needs the parked native module.

**Working directory:** `/Users/sarias/develop/deepdots-popup-sdk` (stay on `main`).

---

## File Structure

- Modify: `src/analytics/crash-reporter.ts` — add `ReactNativeErrorUtils` type, public `captureUnhandled(error)`, `installReactNative(errorUtils)`; refactor window handlers + `_persistForTest` to use `captureUnhandled`.
- Modify: `src/analytics/crash-reporter.test.ts` — tests for `installReactNative` + `captureUnhandled`.
- Modify: `src/core/deepdots-popups.ts` — public `installReactNativeCrashHandler(errorUtils)`.
- Modify: `src/react-native/setup.ts` — `errorUtils` dep + wiring (with `global.ErrorUtils` fallback).
- Modify: `src/react-native/setup.test.ts` — test that setup installs the RN crash handler.
- Modify: `src/index.ts` — export `ReactNativeErrorUtils` type.
- Modify: `INTEGRACION-REACT-NATIVE.md` + `docs/ANALYTICS-BACKEND-SPEC.md` — coverage notes.

---

## Task 1: CrashReporter — captureUnhandled + installReactNative

**Files:**
- Modify: `src/analytics/crash-reporter.ts`
- Modify: `src/analytics/crash-reporter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/analytics/crash-reporter.test.ts` (at end of file):
```typescript
describe('CrashReporter.installReactNative', () => {
  function makeErrorUtils() {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    return {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => { handler = h; },
      fire: (error: unknown, isFatal?: boolean) => handler?.(error, isFatal),
    };
  }

  it('hooks ErrorUtils: a thrown error is persisted and the previous handler is chained', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({ appVersion: '1.0.0' }),
      sessionId: () => 'sess-1',
      now: () => 7_000,
      enabled: () => true,
    });
    const eu = makeErrorUtils();
    const previous = vi.fn();
    eu.setGlobalHandler(previous); // simula un handler ya instalado (p.ej. del runtime RN)

    reporter.installReactNative(eu);
    eu.fire(new TypeError('rn boom'), true);

    // se persistió el crash
    const drained = reporter.drainPendingCrashes();
    expect(drained).toHaveLength(1);
    expect(drained[0].crashType).toBe('TypeError');
    expect(drained[0].message).toBe('rn boom');
    expect(drained[0].fatal).toBe(true);
    expect(drained[0].handled).toBe(false);
    // y se encadenó al handler previo
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does not persist when disabled, but still chains to the previous handler', () => {
    const storage = new InMemoryStorage();
    const reporter = new CrashReporter({
      storage, emit: vi.fn(),
      device: () => ({}), sessionId: () => null, now: () => 1, enabled: () => false,
    });
    const eu = makeErrorUtils();
    const previous = vi.fn();
    eu.setGlobalHandler(previous);

    reporter.installReactNative(eu);
    eu.fire(new Error('x'), false);

    expect(reporter.drainPendingCrashes()).toEqual([]);
    expect(previous).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: FAIL — `reporter.installReactNative is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/analytics/crash-reporter.ts`, add this interface after the `DeviceSnapshot` interface (around line 42):
```typescript
/** Forma mínima de `global.ErrorUtils` de React Native. */
export interface ReactNativeErrorUtils {
  getGlobalHandler?(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}
```

Add a public `captureUnhandled` method to the class, immediately after `reportError(...)` (before the private `persist`):
```typescript
  /** Captura un error no manejado (fatal) → persiste a disco para replay en el siguiente arranque. */
  captureUnhandled(error: unknown): void {
    this.persist(this.buildRecord(error, 'fatal', false, true));
  }
```

Refactor the `install()` window handlers to delegate to `captureUnhandled` (replace the two `this.persist(this.buildRecord(...))` calls inside `install()`):
```typescript
  install(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e: ErrorEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.error ?? e.message ?? 'error');
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!this.isEnabled()) return;
      this.captureUnhandled(e.reason ?? 'unhandledrejection');
    });
  }

  /** Engancha `global.ErrorUtils` de RN (no hay `window`): persiste y encadena al handler previo. */
  installReactNative(errorUtils: ReactNativeErrorUtils): void {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      if (this.isEnabled()) this.captureUnhandled(error);
      previous?.(error, isFatal);
    });
  }
```

Refactor `_persistForTest` to delegate (keep it for the existing Plan-2 tests):
```typescript
  /** @internal Test seam: ejercita el camino de persistencia (window handlers no son testeables en vitest). */
  _persistForTest(error: unknown): void {
    this.captureUnhandled(error);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/analytics/crash-reporter.test.ts`
Expected: PASS (all existing tests + 2 new `installReactNative` tests; the `_persistForTest`/queue tests still pass since behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/crash-reporter.ts src/analytics/crash-reporter.test.ts
git commit -m "Add CrashReporter.installReactNative + captureUnhandled (RN JS errors)"
```

---

## Task 2: Wire RN crash capture into DeepdotsPopups + setupReactNative

**Files:**
- Modify: `src/core/deepdots-popups.ts`
- Modify: `src/react-native/setup.ts`
- Modify: `src/react-native/setup.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/react-native/setup.test.ts` inside the `describe('setupReactNative', ...)` block:
```typescript
  it('engancha global.ErrorUtils para capturar errores JS no manejados de RN', () => {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const errorUtils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => { handler = h; },
    };
    const spy = vi.spyOn(sdk, 'installReactNativeCrashHandler');

    setupReactNative(sdk, { apiKey: 'k' }, { errorUtils, renderer: new NoopPopupRenderer() });

    expect(spy).toHaveBeenCalledWith(errorUtils);
    // y el handler quedó instalado
    expect(typeof handler).toBe('function');
  });
```

> Confirm the test file's `beforeEach` creates a fresh `sdk = new DeepdotsPopups()`; it does (used by the existing tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/react-native/setup.test.ts`
Expected: FAIL — `sdk.installReactNativeCrashHandler is not a function`.

- [ ] **Step 3: Add the public method on `DeepdotsPopups`**

In `src/core/deepdots-popups.ts`, update the crash-reporter import to also bring the type:
```typescript
import { CrashReporter, crashRecordToParams, type ReportErrorOptions, type ReactNativeErrorUtils } from '../analytics/crash-reporter';
```
Add this public method right after the existing `reportError(...)` method:
```typescript
    /** Engancha `global.ErrorUtils` de RN para capturar errores JS no manejados. No-op si tracking off. */
    installReactNativeCrashHandler(errorUtils: ReactNativeErrorUtils): void {
        if (!this.tracking?.isTrackingEnabled()) return;
        this.crashReporter?.installReactNative(errorUtils);
    }
```

- [ ] **Step 4: Wire it in `setupReactNative`**

In `src/react-native/setup.ts`, import the type at the top (next to the other type imports):
```typescript
import type { ReactNativeErrorUtils } from '../analytics/crash-reporter';
```
Add `errorUtils` to the `ReactNativeSetupDeps` interface:
```typescript
  /** `global.ErrorUtils` de RN (para capturar errores JS no manejados). Default: `globalThis.ErrorUtils`. */
  errorUtils?: ReactNativeErrorUtils | null;
```
In `setupReactNative`, immediately AFTER the `sdk.init({ ...config, storage, device, platform });` line, add:
```typescript
  // Captura de errores JS no manejados en RN (no hay `window`): usa el ErrorUtils inyectado
  // o el global del runtime RN. Degrada si no existe.
  const errorUtils =
    deps.errorUtils ?? (globalThis as { ErrorUtils?: ReactNativeErrorUtils }).ErrorUtils;
  if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
    sdk.installReactNativeCrashHandler(errorUtils);
  }
```

- [ ] **Step 5: Export the type from `src/index.ts`**

Update the crash-reporter type export line to include `ReactNativeErrorUtils`:
```typescript
export type { CrashRecord, CrashSeverity, ReportErrorOptions, DeviceSnapshot, ReactNativeErrorUtils } from './analytics/crash-reporter';
```

- [ ] **Step 6: Run the RN tests**

Run: `npx vitest run src/react-native/setup.test.ts`
Expected: PASS (existing + 1 new).

- [ ] **Step 7: Full suite + build**

Run: `npm test`
Expected: PASS (ignore ONLY a preexisting unrelated failure in `src/ui/renderPopup.inject-style.test.ts` if it appears).

Run: `npm run build`
Expected: success (main + react-native bundles + d.ts; no type errors from the new export).

- [ ] **Step 8: Commit**

```bash
git add src/core/deepdots-popups.ts src/react-native/setup.ts src/react-native/setup.test.ts src/index.ts
git commit -m "Wire RN unhandled-JS crash capture via ErrorUtils in setupReactNative"
```

---

## Task 3: Document RN crash coverage

**Files:**
- Modify: `INTEGRACION-REACT-NATIVE.md`
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md`

- [ ] **Step 1: Add a crash-reporting section to `INTEGRACION-REACT-NATIVE.md`**

Find a sensible spot (e.g. after the analytics/tracking usage section) and add:
```markdown
## Crash & error reporting

`setupReactNative` engancha automáticamente `global.ErrorUtils` para capturar los **errores JS no manejados** de la app RN — se reportan como evento `deepdots_app_crash` (persistidos y reenviados en el siguiente arranque). No necesitas hacer nada.

Para reportar errores manualmente (capturados, con severidad/contexto):
```ts
try {
  // ...
} catch (e) {
  sdk.reportError(e, { severity: 'error', context: { screen: 'Checkout' } });
}
```

> **Cobertura:** se capturan los errores del hilo **JS**. Los crashes **nativos** (iOS/Android bajo RN) requieren un crash reporter nativo dedicado (no incluido). Si el host ya usa uno (Crashlytics/Sentry), puede reenviar a `reportError`.
```
(If `ErrorUtils` is passed explicitly, document `setupReactNative(sdk, config, { errorUtils: global.ErrorUtils })`; the default already reads `globalThis.ErrorUtils`.)

- [ ] **Step 2: Update the platform-coverage note in `docs/ANALYTICS-BACKEND-SPEC.md`**

Find the `deepdots_app_crash` "Cobertura por plataforma" blockquote and add a sentence about RN (or extend it):
```markdown
> **React Native:** captura errores del hilo JS vía `global.ErrorUtils` (enganchado por `setupReactNative`) + `reportError()`. Los crashes nativos bajo RN requieren captura nativa dedicada (no incluida).
```

- [ ] **Step 3: Commit**

```bash
git add INTEGRACION-REACT-NATIVE.md docs/ANALYTICS-BACKEND-SPEC.md
git commit -m "Docs: document RN JS crash capture (ErrorUtils)"
```

---

## Notas

- El fallo preexistente de `src/ui/renderPopup.inject-style.test.ts` es ajeno; no bloquea.
- `reportError()` ya funcionaba en RN (es una llamada normal); este plan añade la captura **automática** de errores JS no manejados.
- Persistencia en RN: el storage es MMKV (síncrono), así que un crash JS persiste el record antes de morir y se reenvía en el siguiente arranque.
- Fuera de scope (parked): crashes **nativos** bajo RN (necesitan módulo nativo PLCrashReporter/xCrash), igual que el Plan 4 nativo aparcado.
