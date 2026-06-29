# Crash & Error Reporting (Stability #14–17) — Diseño

**Fecha:** 2026-06-29
**Estado:** Diseño aprobado, pendiente de plan de implementación
**SDKs afectados:** Web/JS (`@magicfeedback/popup-sdk`), KMP (Android + iOS), React Native (subpath `/react-native`)

---

## 1. Objetivo

Que el SDK detecte y reporte errores/crashes por su cuenta (estilo Sentry/Crashlytics) para cubrir las métricas de **Stability** que hoy están fuera de scope:

- **#14** Crash-Free Users (%)
- **#15** Crashes – Latest Release
- **#16** Crashes – Crash Breakdown (por *Error; OS Version; Device Model; App Version*)
- **#17** Crashes – Summary

Más una **API pública** para que el host reporte sus propios errores (manejados o no) con severidad y contexto.

Cobertura objetivo: **lo más completa posible en iOS, Android, React Native y Web JS.**

## 2. Alcance

**Dentro:**
- Captura automática de crashes nativos (iOS señales/Mach, Android NDK+JVM) envolviendo librerías probadas.
- Captura de errores gestionados (NSException, JVM uncaught, errores JS no manejados, JS thread en RN).
- API pública `reportError(error, { severity, handled, context })`.
- Persistencia a disco + reenvío en el siguiente arranque por el canal de analytics existente.
- Marcador `deepdots_session_start` para calcular crash-free.
- **Migración de TODOS los eventos del SDK al prefijo `deepdots_`** (breaking change de contrato).

**Fuera:**
- Symbolication server-side (dSYM / mapping R8/ProGuard) — es pipeline de build + backend, no del SDK. El SDK manda el stack sin simbolizar.
- ANRs (Android) y watchdog terminations (iOS) salvo lo que cubra la librería envuelta de serie.
- Endpoint propio de crashes — se reutiliza `POST /sdk/feedback`.

## 3. Decisión: envolver librerías probadas

La captura de señales async-signal-safe y el unwinding/symbolication son justo donde Sentry/Crashlytics llevan años. No lo hacemos a mano:

| Plataforma | Crash nativo | Errores gestionados |
|---|---|---|
| **iOS (KMP)** | **PLCrashReporter** (Mach exceptions + señales) | `NSSetUncaughtExceptionHandler` |
| **Android (KMP)** | **xCrash** (Apache-2.0, NDK/señales) | `Thread.setDefaultUncaughtExceptionHandler` (encadenando al previo) |
| **Web JS** | — (no hay crash nativo) | `window.addEventListener('error')` + `'unhandledrejection'` |
| **React Native** | **módulo nativo nuevo** que envuelve PLCrashReporter/xCrash | `global.ErrorUtils.setGlobalHandler` (thread JS) |

> El handler de Android encadena SIEMPRE al handler previo para no romper un Crashlytics/Sentry que el host ya tenga instalado.

## 4. El problema central y el pipeline

Un crash mata el proceso **antes** del flush normal (memoria → lote → POST). Por eso el pipeline es distinto:

```
1. install() registra handlers lo antes posible en init()
2. En el crash, la librería envuelta escribe el reporte a DISCO de forma síncrona/signal-safe
3. En el SIGUIENTE arranque: drainPendingCrashes() lee de disco → convierte a
   evento deepdots_app_crash → track() → flush normal lo envía → se borra de disco
```

Más `deepdots_session_start` al arrancar para que el backend calcule **#14 Crash-Free** = 1 − (sesiones con `deepdots_app_crash` / sesiones totales).

## 5. Eventos nuevos (reservados)

Viajan por el canal de analytics actual (`POST /sdk/feedback`), como entradas en `feedback.metadata` con formato `{ key, value: [JSON] }`.

### `deepdots_app_crash`
```json
{
  "crashed_at": 1750000000000,
  "crash_type": "NullPointerException",
  "message": "Attempt to invoke ... on a null object reference",
  "stack": "<texto truncado ~8KB>",
  "fatal": true,
  "handled": false,
  "severity": "fatal",
  "crashed_session_id": "abc-123",
  "crashed_app_version": "1.0.0",
  "crashed_os_version": "17.4",
  "crashed_device_model": "iPhone14,3",
  "ctx_screen": "CheckoutScreen",
  "ctx_order_id": "o-42"
}
```
- `crashed_at`: timestamp **real** del crash (≠ timestamp de envío, porque se reenvía en el siguiente arranque). El backend usa este.
- `crash_type`: clase de excepción o nombre de señal (`SIGSEGV`, `SIGABRT`…). Dimensión "Error" de #16.
- `severity`: `fatal` | `error` | `warning`.
- `handled`: `true` si vino por `reportError`, `false` si es un crash no capturado.
- `crashed_session_id`: la sesión en la que ocurrió.
- `crashed_app_version` / `crashed_os_version` / `crashed_device_model`: capturados **en el momento del crash** y persistidos con el reporte. ⚠️ **Críticos**: el replay ocurre en el siguiente arranque, que puede ser en otra app_version/OS (el usuario actualizó tras el crash). Por eso NO se pueden tomar de `context.device` del envelope —ese refleja el estado *actual*, no el del crash—. El backend usa estos para #15 ("Latest Release") y #16 (breakdown).
- `ctx_*`: el `context` que pase el host por `reportError`, aplanado con prefijo `ctx_`.

### `deepdots_session_start`
```json
{ "timestamp": 1750000000000 }
```
Emitido una vez en `init()`. Base para crash-free (#14).

## 6. Migración de eventos a `deepdots_` (breaking change)

**Todos** los eventos generados por el SDK pasan a llevar prefijo. Los eventos **custom del host** (vía `track(name, params)`) NO se tocan.

| Antes | Después |
|---|---|
| `page_view` | `deepdots_page_view` |
| `user_engagement` | `deepdots_user_engagement` |
| `mini_service_enter` | `deepdots_mini_service_enter` |
| `mini_service_exit` | `deepdots_mini_service_exit` |
| `search` | `deepdots_search` |
| `findability_friction` | `deepdots_findability_friction` |
| `funnel_step` | `deepdots_funnel_step` |
| *(nuevo)* | `deepdots_app_crash` |
| *(nuevo)* | `deepdots_session_start` |

Implementación: cambiar los literales en los call-sites internos de `track()`. El método público `track(name, params)` sigue respetando el nombre que pase el host.

⚠️ **Coordinar con backend**: los nombres de eventos reservados cambian. Actualizar el contrato del endpoint y `ANALYTICS-BACKEND-SPEC.md`.

## 7. Módulo `CrashReporter`

Pieza nueva, aislada, con la misma forma en los dos SDKs.

**API (común):**
- `install()` — registra los handlers de plataforma. Llamado al principio de `init()`.
- `reportError(error, options)` — **API pública (Opción C)**. `options = { severity?, handled?, context? }`. Default `severity: 'error'`, `handled: true`.
- `drainPendingCrashes(): CrashRecord[]` — lee de disco los crashes de sesiones anteriores y los borra.

**Cola en disco propia** (no el `KeyValueStorage` normal): hay que escribir desde el contexto del crash de forma síncrona/signal-safe.
- iOS/Android: la librería envuelta gestiona su propio fichero; al arrancar lo leemos y convertimos.
- Web/RN-JS: `localStorage` / store inyectable (síncrono) en el handler.
- En tests: store de disco **inyectable** (mismo patrón que `storage`).

**Gating de consentimiento:** respeta el kill-switch existente — `trackingEnabled` (init) y `setTrackingEnabled()`. Desactivado ⇒ no instala handlers ni hace replay. Si al reenviar (siguiente arranque) el tracking está desactivado, se descartan los pendientes.

## 8. Replay (reenvío en el siguiente arranque)

En `init()`, tras crear `analytics`:
1. `crashReporter.drainPendingCrashes()`
2. por cada `CrashRecord` → `analytics.track('deepdots_app_crash', {…})` con su `crashed_at` y `crashed_session_id` originales
3. el flush normal (periódico / batch / lifecycle) lo envía
4. se borra de disco al encolar (v1 simple)

> Trade-off conocido: borrar-al-encolar puede perder un crash si el POST falla. La alternativa borrar-tras-ACK es más fiable pero necesita confirmación del sink. Queda como mejora futura, no en v1.

## 9. React Native — matiz de cobertura

RN corre el SDK JS sobre el runtime nativo:
- **Errores JS** (la mayoría de fallos de la app RN): el `CrashReporter` JS detecta RN y usa `global.ErrorUtils.setGlobalHandler` (+ rechazos de promesa). Cubierto por el SDK JS / `setupReactNative`.
- **Crashes nativos** (iOS/Android bajo RN): NO capturables desde JS. Para cobertura completa se añade un **módulo nativo** en el paquete `/react-native` que envuelve PLCrashReporter/xCrash y, al arrancar, entrega los reportes pendientes al SDK JS (vía evento del bridge) para que entren por el mismo replay.
- Es la pieza más grande del trabajo y se implementa como entrega separada dentro de la misma feature.

## 10. Backend (contrato)

Documentar en `ANALYTICS-BACKEND-SPEC.md` + contrato del endpoint:
- Eventos reservados nuevos: `deepdots_app_crash`, `deepdots_session_start`.
- Renombrado de los eventos reservados existentes a `deepdots_*` (breaking).
- Cálculos derivados:
  - **#14 Crash-Free Users** = 1 − (sesiones con `deepdots_app_crash` / sesiones totales)
  - **#15 Crashes – Latest Release** = crashes filtrados por el `crashed_app_version` más reciente (del propio evento, NO del envelope)
  - **#16 Crash Breakdown** = group by `crash_type` × `crashed_os_version` × `crashed_device_model` × `crashed_app_version` (todos del propio evento `deepdots_app_crash`)
  - **#17 Summary** = totales/agregados

## 11. Testing

`commonTest` (KMP) / `vitest` (Web) con un store de disco **inyectable**:
- un error reportado vía `reportError` se persiste; `drainPendingCrashes()` lo devuelve y vacía el store
- el replay produce un `deepdots_app_crash` con `crash_type`, `severity`, `handled`, `crashed_at`, `crashed_session_id`, `crashed_app_version`/`crashed_os_version`/`crashed_device_model` (capturados al crash, no del envelope) y `ctx_*` correctos
- todo gateado por `trackingEnabled` (desactivado ⇒ no persiste ni reenvía)
- migración: los call-sites internos emiten `deepdots_page_view` etc.; los custom del host se respetan
- paridad Web ↔ KMP, como en el resto del SDK

La captura **real** de señales nativas no es unit-testeable (integración/manual). El grueso de nuestro código — cola, replay, API, gating, mapeo a evento — sí.

## 12. Ficheros

**Web/JS:**
- `src/analytics/crash-reporter.ts` (+ `crash-reporter.test.ts`)
- wiring en `src/core/deepdots-popups.ts` (install + session_start + replay)
- migración de literales de evento en `deepdots-popups.ts` y helpers
- exports en `src/index.ts`
- adapter RN (ErrorUtils) en `src/react-native/` + integración en `setupReactNative`

**KMP:**
- `analytics/CrashReporter.kt` (commonMain) + `expect`
- actuals: `CrashReporter.android.kt` (xCrash + UncaughtExceptionHandler), `CrashReporter.ios.kt` (PLCrashReporter + NSSetUncaughtExceptionHandler)
- wiring en `DeepdotsPopups.kt`
- migración de literales de evento en `DeepdotsPopups.kt` / `AnalyticsManager` helpers

**RN (módulo nativo):**
- módulo nativo en el paquete `/react-native` que envuelve PLCrashReporter/xCrash y entrega al SDK JS

**Docs:**
- actualizar `ANALYTICS-BACKEND-SPEC.md` (eventos reservados + breaking rename)
- actualizar `TRACKING-CASOS-DE-USO.md` (lista de eventos reservados)
- `INTEGRACION-REACT-NATIVE.md` y `INTEGRACION-WEB.md` (cómo usar `reportError`)

## 13. Orden de implementación sugerido

1. **Migración de eventos a `deepdots_`** (aislada, testeable, desbloquea coherencia)
2. **`CrashReporter` core + API `reportError` + cola en disco + replay** (commonMain / Web), con store inyectable y tests — sin librerías nativas todavía (cubre gestionados)
3. **Wiring** en ambos `DeepdotsPopups` + `deepdots_session_start`
4. **Actual iOS** (PLCrashReporter) y **actual Android** (xCrash)
5. **RN**: ErrorUtils en JS + módulo nativo
6. **Docs + contrato backend**
