# Event Prefix Migration (`deepdots_`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renombrar todos los eventos generados por el SDK al prefijo `deepdots_` en ambos SDKs (Web + KMP), dejando intactos los eventos custom del host y los nombres de trigger de popup.

**Architecture:** Cambio mecánico de literales en los call-sites internos de `track()`. El método público `track(name, params)` no se toca: el host sigue enviando los nombres que quiera sin prefijo. Se aplica con TDD inverso (rename): primero se actualizan las assertions de los tests a los nombres nuevos (rojo), luego los literales de source (verde).

**Tech Stack:** TypeScript + vitest + Playwright (Web); Kotlin Multiplatform + kotlin.test + Gradle (KMP).

**Eventos a renombrar (SDK-generated):** `page_view`, `user_engagement`, `mini_service_enter`, `mini_service_exit`, `search`, `findability_friction`, `funnel_step` → cada uno con prefijo `deepdots_`.

⚠️ **NO tocar:**
- Llamadas a `track('page_view', …)` / `am.track("page_view", …)` dentro de tests que simulan el uso del host del API público (se quedan sin prefijo).
- Los usos de `"search"` como **nombre de trigger de popup** — NO son el evento de analytics y se quedan igual. Aparecen como `Trigger.Event("search")` / `triggerEvent("search")` en `DeepdotsPopupsParityTest.kt` (KMP) y como `{ type: 'event', value: 'search' }` / `triggerEvent('search')` en `deepdots-popups.test.ts` y `deepdots-popups.event.test.ts` (Web).
- Strings de descripción de tests (`it('… emits mini_service_exit …')`) — cosméticos, opcionales.

---

## File Structure

**Web (`/Users/sarias/develop/deepdots-popup-sdk`):**
- Modify: `src/analytics/analytics-manager.ts` — 2 literales (`mini_service_enter/exit`)
- Modify: `src/core/deepdots-popups.ts` — 5 literales (`page_view`, `search`, `findability_friction`, `funnel_step`, `user_engagement`)
- Modify (tests): `src/analytics/analytics-manager.test.ts`, `src/core/deepdots-popups.analytics.test.ts`, `src/core/deepdots-popups.rn.test.ts`, `tests/e2e/tracking.spec.ts`

**KMP (`/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK`):**
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/AnalyticsManager.kt` — 2 literales
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt` — 5 literales
- Modify (tests): `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`, `shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/AnalyticsManagerParityTest.kt`

**Docs (`/Users/sarias/develop/deepdots-popup-sdk`):**
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md`

---

## Task 1: Web — actualizar assertions de tests (rojo)

**Files:**
- Modify: `src/analytics/analytics-manager.test.ts`
- Modify: `src/core/deepdots-popups.analytics.test.ts`
- Modify: `src/core/deepdots-popups.rn.test.ts`
- Modify: `tests/e2e/tracking.spec.ts`

- [ ] **Step 1: Actualizar `analytics-manager.test.ts`**

Reemplazar la assertion del evento de `enterMiniService`:
```
name: 'mini_service_enter',
```
por:
```
name: 'deepdots_mini_service_enter',
```

Reemplazar la búsqueda del evento de `exitMiniService`:
```
const exit = events.find((e) => e.name === 'mini_service_exit');
```
por:
```
const exit = events.find((e) => e.name === 'deepdots_mini_service_exit');
```

> NO tocar `am.track('page_view', { screen: '/home' })` ni su assertion — es uso genérico del API público.

- [ ] **Step 2: Actualizar `deepdots-popups.analytics.test.ts`**

Reemplazar:
```
expect(names).toEqual(['mini_service_enter', 'task_started']);
```
por:
```
expect(names).toEqual(['deepdots_mini_service_enter', 'task_started']);
```

Reemplazar la assertion de `trackSearch`:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'search');
```
por:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_search');
```

Reemplazar la assertion de `trackFindabilityFriction`:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'findability_friction');
```
por:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_findability_friction');
```

Reemplazar la assertion de `trackFunnelStep`:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'funnel_step');
```
por:
```
const e = popups.previewAnalytics().events.find((x) => x.name === 'deepdots_funnel_step');
```

> NO tocar `popups.track('page_view', …)` / `sdk.track('page_view', …)` ni la assertion `m.key === 'page_view'` (líneas ~49, ~69, ~78) — son uso del API público del host.

- [ ] **Step 3: Actualizar `deepdots-popups.rn.test.ts`**

Reemplazar la assertion de `setScreen()`:
```
const pv = popups.previewAnalytics().events.filter((e) => e.name === 'page_view');
```
por:
```
const pv = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_page_view');
```

Reemplazar la assertion de `onBackground`:
```
expect(printed).toContain('mini_service_exit');
```
por:
```
expect(printed).toContain('deepdots_mini_service_exit');
```

- [ ] **Step 4: Actualizar `tests/e2e/tracking.spec.ts`**

Reemplazar el filtro de navegación:
```
.events.filter((e: any) => e.name === 'page_view')
```
por:
```
.events.filter((e: any) => e.name === 'deepdots_page_view')
```

- [ ] **Step 5: Ejecutar la suite y verificar que FALLA**

Run: `npm test`
Expected: FAIL — las assertions nuevas esperan `deepdots_*` pero el source aún emite los nombres viejos (p.ej. `expected 'deepdots_search' but got undefined` en analytics tests). El fallo preexistente de `renderPopup.inject-style.test.ts` puede seguir presente; es ajeno.

---

## Task 2: Web — migrar literales de source (verde)

**Files:**
- Modify: `src/analytics/analytics-manager.ts`
- Modify: `src/core/deepdots-popups.ts`

- [ ] **Step 1: `analytics-manager.ts` — `enterMiniService`**

Reemplazar:
```typescript
    this.track('mini_service_enter', { entry_point_type: entryPointType ?? null });
```
por:
```typescript
    this.track('deepdots_mini_service_enter', { entry_point_type: entryPointType ?? null });
```

- [ ] **Step 2: `analytics-manager.ts` — `exitMiniService`**

Reemplazar:
```typescript
    this.track('mini_service_exit', { mini_service: name, duration_seconds: durationSeconds });
```
por:
```typescript
    this.track('deepdots_mini_service_exit', { mini_service: name, duration_seconds: durationSeconds });
```

- [ ] **Step 3: `deepdots-popups.ts` — navegación**

Reemplazar:
```typescript
        this.navObserver.onVisit((v) => this.track('page_view', { screen: v.screen, duration_seconds: v.durationSeconds }));
```
por:
```typescript
        this.navObserver.onVisit((v) => this.track('deepdots_page_view', { screen: v.screen, duration_seconds: v.durationSeconds }));
```

- [ ] **Step 4: `deepdots-popups.ts` — search / findability / funnel**

Reemplazar:
```typescript
        this.track('search', { query, results_count: resultsCount, has_results: resultsCount > 0, ...(params ?? {}) });
```
por:
```typescript
        this.track('deepdots_search', { query, results_count: resultsCount, has_results: resultsCount > 0, ...(params ?? {}) });
```

Reemplazar:
```typescript
        this.track('findability_friction', { friction_topic: frictionTopic, ...(params ?? {}) });
```
por:
```typescript
        this.track('deepdots_findability_friction', { friction_topic: frictionTopic, ...(params ?? {}) });
```

Reemplazar:
```typescript
        this.track('funnel_step', { funnel, step, task_id: taskId, ...(params ?? {}) });
```
por:
```typescript
        this.track('deepdots_funnel_step', { funnel, step, task_id: taskId, ...(params ?? {}) });
```

- [ ] **Step 5: `deepdots-popups.ts` — engagement**

Reemplazar:
```typescript
        if (ms > 0) this.track('user_engagement', { engagement_time_msec: ms });
```
por:
```typescript
        if (ms > 0) this.track('deepdots_user_engagement', { engagement_time_msec: ms });
```

- [ ] **Step 6: Ejecutar la suite unit y verificar que PASA**

Run: `npm test`
Expected: PASS (salvo el preexistente `renderPopup.inject-style.test.ts`, ajeno a este cambio).

- [ ] **Step 7: Ejecutar E2E y verificar que PASA**

Run: `npm run e2e`
Expected: PASS — 5/5 en Chromium, incluido el test de navegación que ahora filtra `deepdots_page_view`.

- [ ] **Step 8: Commit**

```bash
git add src/analytics/analytics-manager.ts src/core/deepdots-popups.ts \
  src/analytics/analytics-manager.test.ts src/core/deepdots-popups.analytics.test.ts \
  src/core/deepdots-popups.rn.test.ts tests/e2e/tracking.spec.ts
git commit -m "Migrate SDK-generated analytics events to deepdots_ prefix (Web)"
```

---

## Task 3: KMP — actualizar assertions de tests (rojo)

**Files:**
- Modify: `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`
- Modify: `shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/AnalyticsManagerParityTest.kt`

Trabajar en el repo KMP: `/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK`.

- [ ] **Step 1: `DeepdotsPopupsAnalyticsTest.kt`**

Reemplazar:
```kotlin
        assertEquals(listOf("mini_service_enter", "task_started"), names)
```
por:
```kotlin
        assertEquals(listOf("deepdots_mini_service_enter", "task_started"), names)
```

Reemplazar:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "search" }
```
por:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "deepdots_search" }
```

Reemplazar:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "findability_friction" }
```
por:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "deepdots_findability_friction" }
```

Reemplazar:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "funnel_step" }
```
por:
```kotlin
        val e = s.previewAnalytics().events.first { it.name == "deepdots_funnel_step" }
```

Reemplazar:
```kotlin
        val pv = s.previewAnalytics().events.filter { it.name == "page_view" }
```
por:
```kotlin
        val pv = s.previewAnalytics().events.filter { it.name == "deepdots_page_view" }
```

> NO tocar `s.track("page_view", mapOf("screen" to "/home"))` (línea ~63) — es uso del API público.

- [ ] **Step 2: `AnalyticsManagerParityTest.kt`**

Reemplazar:
```kotlin
        assertEquals("mini_service_enter", e[0].name)
```
por:
```kotlin
        assertEquals("deepdots_mini_service_enter", e[0].name)
```

Reemplazar:
```kotlin
        val exit = events.first { it.name == "mini_service_exit" }
```
por:
```kotlin
        val exit = events.first { it.name == "deepdots_mini_service_exit" }
```

> NO tocar `am.track("page_view", mapOf("screen" to "/home"))` (línea ~70) — uso del API público.

- [ ] **Step 3: Ejecutar y verificar que FALLA**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD FAILED — assertions esperan `deepdots_*` pero el source emite los nombres viejos.

---

## Task 4: KMP — migrar literales de source (verde)

**Files:**
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/AnalyticsManager.kt`
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt`

- [ ] **Step 1: `AnalyticsManager.kt` — enter/exit mini-service**

Reemplazar:
```kotlin
        track("mini_service_enter", mapOf("entry_point_type" to entryPointType))
```
por:
```kotlin
        track("deepdots_mini_service_enter", mapOf("entry_point_type" to entryPointType))
```

Reemplazar:
```kotlin
        track("mini_service_exit", mapOf("mini_service" to name, "duration_seconds" to durationSeconds))
```
por:
```kotlin
        track("deepdots_mini_service_exit", mapOf("mini_service" to name, "duration_seconds" to durationSeconds))
```

- [ ] **Step 2: `DeepdotsPopups.kt` — navegación**

Reemplazar:
```kotlin
            obs.onVisit { v -> track("page_view", mapOf("screen" to v.screen, "duration_seconds" to v.durationSeconds)) }
```
por:
```kotlin
            obs.onVisit { v -> track("deepdots_page_view", mapOf("screen" to v.screen, "duration_seconds" to v.durationSeconds)) }
```

- [ ] **Step 3: `DeepdotsPopups.kt` — search**

Reemplazar:
```kotlin
        track("search", buildMap<String, Any?> {
```
por:
```kotlin
        track("deepdots_search", buildMap<String, Any?> {
```

- [ ] **Step 4: `DeepdotsPopups.kt` — findability_friction**

Reemplazar:
```kotlin
        track("findability_friction", buildMap<String, Any?> {
```
por:
```kotlin
        track("deepdots_findability_friction", buildMap<String, Any?> {
```

- [ ] **Step 5: `DeepdotsPopups.kt` — funnel_step**

Reemplazar:
```kotlin
        track("funnel_step", buildMap<String, Any?> {
```
por:
```kotlin
        track("deepdots_funnel_step", buildMap<String, Any?> {
```

- [ ] **Step 6: `DeepdotsPopups.kt` — user_engagement**

Reemplazar:
```kotlin
        if (ms > 0) track("user_engagement", mapOf("engagement_time_msec" to ms))
```
por:
```kotlin
        if (ms > 0) track("deepdots_user_engagement", mapOf("engagement_time_msec" to ms))
```

- [ ] **Step 7: Ejecutar tests y verificar que PASA**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Verificar que iOS compila**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew compileKotlinIosSimulatorArm64`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 9: Commit**

```bash
cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK
git add shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/AnalyticsManager.kt \
  shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt \
  shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt \
  shared/src/commonTest/kotlin/com/deepdots/sdk/analytics/AnalyticsManagerParityTest.kt
git commit -m "Migrate SDK-generated analytics events to deepdots_ prefix (KMP)"
```

---

## Task 5: Docs — actualizar contrato de eventos reservados

**Files:**
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md`

- [ ] **Step 1: Renombrar los eventos en los ejemplos JSON del body**

En la sección 2 (estructura del body), reemplazar las entradas de ejemplo de eventos:
```
      { "key": "page_view",          "value": ["{\"timestamp\":1750000000000,\"screen\":\"HomeScreen\",\"duration_seconds\":42}"] },
      { "key": "user_engagement",    "value": ["{\"timestamp\":1750000005000,\"engagement_time_msec\":38000}"] },
```
por:
```
      { "key": "deepdots_page_view",       "value": ["{\"timestamp\":1750000000000,\"screen\":\"HomeScreen\",\"duration_seconds\":42}"] },
      { "key": "deepdots_user_engagement", "value": ["{\"timestamp\":1750000005000,\"engagement_time_msec\":38000}"] },
```

> El evento de ejemplo `add_to_cart` se queda igual — es un evento custom del host.

- [ ] **Step 2: Actualizar los nombres en el catálogo de eventos (sección 3)**

En la sección "Eventos automáticos del SDK", renombrar los encabezados y referencias:
- `#### page_view` → `#### deepdots_page_view`
- `#### user_engagement` → `#### deepdots_user_engagement`
- `#### mini_service_enter` → `#### deepdots_mini_service_enter`
- `#### mini_service_exit` → `#### deepdots_mini_service_exit`

En la sección "Eventos del host", renombrar los que son helpers del SDK (no custom libres):
- `#### search` → `#### deepdots_search`
- `#### findability_friction` → `#### deepdots_findability_friction`
- `#### funnel_step` → `#### deepdots_funnel_step`

- [ ] **Step 3: Añadir nota de breaking change**

Tras la tabla "Convención de claves", añadir el párrafo:
```markdown
> **Breaking change (2026-06-29):** todos los eventos generados por el SDK pasan a llevar prefijo `deepdots_` (`deepdots_page_view`, `deepdots_user_engagement`, `deepdots_mini_service_enter/exit`, `deepdots_search`, `deepdots_findability_friction`, `deepdots_funnel_step`). Solo los eventos custom del host (vía `track(name, …)`) van sin prefijo. El backend debe actualizar cualquier consulta que filtre por los nombres antiguos.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ANALYTICS-BACKEND-SPEC.md
git commit -m "Docs: rename reserved analytics events to deepdots_ prefix"
```

---

## Notas

- El fallo preexistente de `src/ui/renderPopup.inject-style.test.ts` en Web es ajeno a este cambio; no bloquea.
- Tras este plan, el siguiente es **Plan 2 — CrashReporter core + reportError + replay + session_start** (los eventos nuevos `deepdots_app_crash` / `deepdots_session_start` ya encajan en la convención migrada aquí).
