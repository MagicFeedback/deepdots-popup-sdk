# Tracking SDK — Casos de uso y resultado esperado

> Matriz de QA: cada caso → **qué produce el SDK** (eventos, payload, storage, consola). Cubre Web (`@magicfeedback/popup-sdk`) y KMP (Android+iOS), en paridad.
>
> **Cómo leerlo:**
> - **Analytics en dry-run:** hoy el SDK NO hace POST de analítica; el `console.log`/`println` del payload ES el resultado a verificar. Cuando backend defina `/sdk/analytics`, solo se cambia el sink por el POST.
> - **Eventos de popup** (`POST /sdk/popups`) SÍ se envían (canal existente).
> - **Logs de consola** requieren `debug: true`.
> - **Web:** navegación y lifecycle automáticos. **KMP:** navegación por `setPath()`, lifecycle por `onForeground()`/`onBackground()` (los llama el host).
> - Todo el tracking está gobernado por **`setTrackingEnabled(boolean)`** (default `true`).

---

## 0. El payload de analytics (envelope)

Lo que se acumula y se "enviaría" a `POST /sdk/analytics`:

```jsonc
{
  "publicKey": "pk-…",
  "userId": "uuid|cliente",          // clave de vínculo
  "sessionId": "…|null",             // del backend; null hasta el 1er popup event
  "context": {
    "platform": "web|android|ios",
    "language": "es-ES",
    "device": { "device_type": "...", "os_version": "...", "device_model": "...", "app_version": "...", "user_agent": "..." },
    "attributes": { "registration_status": "...", "pass_type": "...", ... }
  },
  "events": [ { "name": "...", "timestamp": 1781…, "params": { ... } } ]
}
```

`previewAnalytics()` devuelve este objeto sin enviar; `flushAnalytics()` lo imprime (dry-run) y vacía el buffer.

---

## 1. Identidad — `user_id`

| Caso | Acción | Resultado del tracking | Web | KMP |
|---|---|---|---|---|
| 1.1 Usuario nuevo | `init()` sin `userId` | Se genera UUID v4, se persiste y `getUserId()` lo devuelve. Consola: `tracking · user_id: <uuid> · new_user: true` | localStorage `deepdots.user_id` + `deepdots.user.first_seen` | SharedPreferences `deepdots_sdk` / NSUserDefaults |
| 1.2 Usuario recurrente | recargar / reabrir | **Mismo** `user_id` (no se regenera). `new_user: false` | ✅ | ✅ |
| 1.3 userId del cliente | `init({ userId })` (web) / `metadata["userId"]` (KMP) | `getUserId()` = ese id; **NO** se persiste en storage | `deepdots.user_id` ausente | clave ausente |
| 1.4 Sin storage del host (KMP) | host no pasa `storage` | Persiste igual (SharedPreferences/NSUserDefaults por defecto, cero config) | n/a | ✅ |

## 2. Sesión — `session_id` (propiedad del backend)

| Caso | Acción | Resultado del tracking |
|---|---|---|
| 2.1 Sin evento de popup | navegar sin popup | `getSessionId()` = `null`. El SDK **no** genera sesión |
| 2.2 Tras evento de popup | se muestra un popup (apiKey) | `POST /sdk/popups` responde `{sessionId}`; el SDK lo **cachea**. Consola: `tracking · session_id from backend: <id>`. `getSessionId()` lo devuelve |
| 2.3 Body del evento | inspeccionar request | body = `{publicKey, status, popupId, userId}` — **NO** lleva `sessionId` |
| 2.4 Inyección en survey | abrir survey | `form()` recibe `profile=[external-user-id]`, `metadata=[session_id?, user_id, mini_service?]`. Consola: `tracking · survey identity → {userId, sessionId, miniService}` |

## 3. Kill-switch — `setTrackingEnabled`

| Caso | Acción | Resultado |
|---|---|---|
| 3.1 Desactivar | `setTrackingEnabled(false)` | `getUserId()`/`getSessionId()` → `null`; `track()`/`enterMiniService()`/`setUserAttributes()` → **no-op**; el evento de popup deja de incluir `sessionId` |
| 3.2 Reactivar | `setTrackingEnabled(true)` | `getUserId()` vuelve a dar el id (NO se borró del storage) |
| 3.3 Arranque sin tracking | `setTrackingEnabled(false)` antes de cualquier actividad | No se genera id ni se captura nada |

## 4. Eventos custom — `track(name, params)`

| Caso | Acción | Evento en el envelope | Consola |
|---|---|---|---|
| 4.1 Evento simple | `track('cta_click', {label:'comprar'})` | `{name:'cta_click', timestamp, params:{label:'comprar'}}` | `analytics · track: cta_click {label:'comprar'}` |
| 4.2 Meaningful interaction (#29-30) | `track('meaningful_interaction', {...})` | evento custom (lo define el host) | idem |
| 4.3 Findability / búsqueda (#31,#34,#35) | **helper** `trackSearch(query, resultsCount)` | evento `search` con `{query, results_count, has_results}` | idem |

## 5. User attributes — `setUserAttributes` (breakdowns)

| Caso | Acción | Resultado |
|---|---|---|
| 5.1 Atributos del cliente | `setUserAttributes({registration_status:'registered', pass_type:'premium', sector, pass_status})` | Aparecen en `context.attributes` (coercidos a string). Alimentan TODOS los breakdowns de las métricas |
| 5.2 Actualización en runtime | volver a llamar con nuevas claves | Se **mezclan** (merge) en `context.attributes` |

## 6. Mini-service (Behaviour #23, #27; CSAT #33)

| Caso | Acción | Resultado del tracking |
|---|---|---|
| 6.1 Entrada | `enterMiniService('checkout','home')` | evento `mini_service_enter` con `params:{mini_service:'checkout', entry_point_type:'home'}` |
| 6.2 Eventos dentro | `track('task_started', {task_id})` mientras activo | el evento lleva **`mini_service:'checkout'`** auto-añadido |
| 6.3 Salida + duración (#27) | `exitMiniService()` | evento `mini_service_exit` con `params:{mini_service, duration_seconds}` (= ahora − enter). Tras salir, los eventos ya **no** llevan `mini_service` |
| 6.4 CSAT por mini-service (#33) | abrir survey con mini-service activo | la metadata del survey incluye `mini_service` (Web vía `form()`, KMP vía `customMetaData` del WebView) |

## 7. Navegación — `page_view` (Content #9-10)

| Caso | Acción | Resultado |
|---|---|---|
| 7.1 Cambio de pantalla | Web: History (`pushState`/`popstate`/`hashchange`). KMP: `setPath('/ruta')` | Al **salir** de cada pantalla → evento `page_view` con `params:{screen, duration_seconds}` |
| 7.2 Normalización | ir a `/producto/123` o `/p/<uuid>` | `screen` = `/producto/:id` (IDs numéricos y UUID → `:id`, sin query, hash preservado) |
| 7.3 Revisita | volver a una pantalla ya vista | Genera un `page_view` nuevo (cada visita es independiente) |
| 7.4 Última pantalla | cierre/background | Se cierra y emite su `page_view` (Web `pagehide`; KMP `onBackground()`) |

## 8. Device info (Technology #11-13)

| Caso | Resultado en `context.device` |
|---|---|
| 8.1 Web | `{device_type:'mobile|tablet|desktop', user_agent:'…', app_version?}` — backend deriva OS/modelo del `user_agent` |
| 8.2 Android | `{device_type, os_version (Build.VERSION.RELEASE), device_model (Build.MODEL), app_version (packageManager)}` |
| 8.3 iOS | `{device_type, os_version (systemVersion), device_model (UIDevice.model), app_version (CFBundleShortVersionString)}` |

`app_version` en Web lo pasa el cliente: `init({ appVersion: '1.2.3' })`.

## 9. Engagement time (#8 Avg Time per Session)

| Caso | Acción | Resultado |
|---|---|---|
| 9.1 Tiempo activo | usar la app en foreground | Se acumula tiempo activo (no cuenta en background) |
| 9.2 Emisión | Web: `visibilitychange:hidden` / `pagehide`. KMP: `onBackground()` | evento `user_engagement` con `params:{engagement_time_msec}` + flush. Backend lo suma por sesión |
| 9.3 Reanudar | Web: pestaña visible. KMP: `onForeground()` | El contador se reanuda (no pierde lo acumulado) |

## 10. Eventos de popup → `POST /sdk/popups` (Messaging #18-22)

| Caso | Acción | Body enviado | status |
|---|---|---|---|
| 10.1 Mostrado | popup se muestra | `{publicKey, status:'SHOWED', popupId, userId}` | `SHOWED` |
| 10.2 Interacción parcial | usuario interactúa sin completar | … `status:'PARTIAL'` | `PARTIAL` |
| 10.3 Completado | survey completado | … `status:'COMPLETED'` | `COMPLETED` |
| 10.4 Respuesta | backend responde | `{sessionId}` → se cachea (ver 2.2) | — |

> Estas métricas (Messaging) salen del canal de popups que **ya existe**; solo se les añadió el cacheo del `sessionId`.

## 11. Lifecycle / flush

| Caso | Web | KMP |
|---|---|---|
| 11.1 App a background | `visibilitychange:hidden` → emite `user_engagement` + flush (pantalla sigue abierta) | host llama `onBackground()` → cierra pantalla (`page_view`) + mini-service (`mini_service_exit`) + `user_engagement` + flush |
| 11.2 App a foreground | `visibilitychange:visible` → reanuda engagement | host llama `onForeground()` → reanuda engagement |
| 11.3 Cierre | `pagehide` → cierra pantalla + mini-service + engagement + flush | (cubierto por `onBackground()`) |

## 12. Funnel (Outstanding Task Funnel)

| Paso | Evento sugerido | params |
|---|---|---|
| Task Assigned → Viewed → Mini-Service Opened → Started → Completed | **helper** `trackFunnelStep(funnel, step, taskId)` | emite `funnel_step` con `{funnel, step, task_id}` |

> El backend reconstruye el embudo (conversión/drop-off/tiempo) agrupando por `funnel` + `task_id` y ordenando por `step`/timestamp. El host emite cada paso con el **helper** `trackFunnelStep(...)` (no improvisa nombres).
>
> **Findability** análogo: `trackSearch(query, resultsCount)` → `search`; `trackFindabilityFriction(frictionTopic)` → `findability_friction`.

---

## Resumen de eventos reservados

| Evento | params | Métrica |
|---|---|---|
| `page_view` | `screen`, `duration_seconds` | Content #9-10 |
| `mini_service_enter` | `mini_service`, `entry_point_type` | Behaviour #23 |
| `mini_service_exit` | `mini_service`, `duration_seconds` | Behaviour #27 |
| `user_engagement` | `engagement_time_msec` | Engagement #8 |
| `search` (helper `trackSearch`) | `query`, `results_count`, `has_results` | Findability #31 |
| `findability_friction` (helper `trackFindabilityFriction`) | `friction_topic` | Findability #34,#35 |
| `funnel_step` (helper `trackFunnelStep`) | `funnel`, `step`, `task_id` | Funnel |
| *(custom del host)* | libres | Meaningful interactions #29-30, etc. |

> **Helpers tipados** (lockean la convención, el host no improvisa): `trackSearch(query, resultsCount, params?)`, `trackFindabilityFriction(frictionTopic, params?)`, `trackFunnelStep(funnel, step, taskId, params?)`. Disponibles en Web y KMP, gated por `setTrackingEnabled`.

## Fuera de scope

- **Crashes / estabilidad (#14-17):** requieren un crash reporter dedicado. No los cubre el SDK de tracking.

## Estado actual (2026-06)

- Identidad, sesión-del-backend, kill-switch, analytics (track/attributes/mini-service), navegación, device info y engagement time: **implementados y en paridad Web+KMP**, en **dry-run**.
- **Bloqueo para envío real (backend, no cliente):** endpoint `/sdk/analytics` + resolver Contact/`user_id` (el `406 "Contact not found"`). Contrato en `~/Downloads/SDK - Analytics - CONTRATO ENDPOINT (backend).md`.
