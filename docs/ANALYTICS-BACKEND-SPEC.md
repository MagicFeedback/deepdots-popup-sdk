# Analytics SDK — Especificación para backend

Documento interno para el equipo de backend. Describe toda la información que el SDK envía a `POST /sdk/feedback` como canal de analytics, cómo está estructurada, y qué debe hacer el backend con ella.

---

## 1. Flujo general

El SDK acumula eventos en un buffer en memoria. En varios momentos del ciclo de vida de la app (pestaña oculta, app a background, cierre de página o llamada manual) hace un **flush**: envía el lote completo a `POST /sdk/feedback`.

```
SDK (cliente)                          Backend
    │                                      │
    │── POST /sdk/feedback (sin sessionId) ─►│  Primera llamada: crea registro
    │◄── { sessionId: "abc-123" } ──────────│  Backend devuelve sessionId
    │                                      │
    │   [más eventos acumulados]           │
    │                                      │
    │── POST /sdk/feedback (sessionId: "abc-123") ─►│  Agrupa al mismo registro
    │◄── { sessionId: "abc-123" } ──────────│
    │                                      │
```

- La primera llamada **no lleva `sessionId`** → el backend crea un nuevo registro y devuelve el `sessionId`.
- Las llamadas siguientes **incluyen `sessionId`** → el backend agrega los eventos al mismo registro.
- Si el usuario hace un nuevo `init()` (nueva sesión de app), se empieza sin `sessionId` y se crea un nuevo registro.

---

## 2. Estructura del body (request)

```json
{
  "publicKey": "b861dfbc1a01d213115aa893f9cdddd1",
  "integration": "6f0d20e0-6e26-11f1-b6d7-cb9b098440a5",
  "completed": false,
  "finished": false,
  "sessionId": "abc-123",
  "feedback": {
    "text": "",
    "answers": [],
    "finished": false,
    "profile": [
      { "key": "external-user-id", "value": ["user-123"] }
    ],
    "metadata": [
      { "key": "deepdots_user_id",         "value": ["sdk-generated-uuid"] },
      { "key": "deepdots_session_id",      "value": ["popup-session-id"] },
      { "key": "deepdots_platform",        "value": ["ios"] },
      { "key": "deepdots_language",        "value": ["es-ES"] },
      { "key": "deepdots_device_type",     "value": ["mobile"] },
      { "key": "deepdots_os_version",      "value": ["17.4"] },
      { "key": "deepdots_device_model",    "value": ["iPhone"] },
      { "key": "deepdots_app_version",     "value": ["2.1.0"] },
      { "key": "deepdots_user_agent",      "value": ["Mozilla/5.0 ..."] },
      { "key": "deepdots_timezone",        "value": ["Europe/Madrid"] },
      { "key": "deepdots_referrer",        "value": ["https://google.com"] },
      { "key": "deepdots_viewport_size",   "value": ["390x844"] },
      { "key": "deepdots_screen_resolution","value": ["1170x2532"] },
      { "key": "deepdots_pixel_ratio",     "value": ["3"] },
      { "key": "deepdots_entry_type",      "value": ["navigate"] },
      { "key": "deepdots_page_load_ms",    "value": ["1240"] },
      { "key": "deepdots_connection_type", "value": ["4g"] },
      { "key": "deepdots_country",         "value": ["ES"] },
      { "key": "deepdots_city",            "value": ["Madrid"] },
      { "key": "plan",               "value": ["premium"] },
      { "key": "sector",             "value": ["retail"] },
      { "key": "deepdots_page_view",       "value": ["{\"timestamp\":1750000000000,\"screen\":\"HomeScreen\",\"duration_seconds\":42}"] },
      { "key": "deepdots_user_engagement", "value": ["{\"timestamp\":1750000005000,\"engagement_time_msec\":38000}"] },
      { "key": "deepdots_event_add_to_cart", "value": ["{\"timestamp\":1750000010000,\"product_id\":\"p-99\",\"value\":49.9}"] }
    ]
  }
}
```

### Convención de claves

| Prefijo | Origen | Ejemplos |
|---|---|---|
| `deepdots_` | Sistema — generado automáticamente por el SDK | `deepdots_user_id`, `deepdots_platform`, `deepdots_country` |
| `deepdots_` | Eventos reservados del SDK | `deepdots_page_view`, `deepdots_user_engagement`, `deepdots_mini_service_enter/exit`, `deepdots_search`, `deepdots_findability_friction`, `deepdots_funnel_step` |
| *(sin prefijo)* | Host — atributos del cliente vía `setUserAttributes()` | `plan`, `sector`, `age` |
| `deepdots_event_` | Eventos custom del host vía `track()` | `deepdots_event_add_to_cart`, `deepdots_event_checkout_started` |

El prefijo `deepdots_` garantiza que los campos del sistema **nunca colisionen** con los del host.

> **Breaking change (2026-06-29):** todos los eventos generados por el SDK pasan a llevar prefijo `deepdots_` (`deepdots_page_view`, `deepdots_user_engagement`, `deepdots_mini_service_enter/exit`, `deepdots_search`, `deepdots_findability_friction`, `deepdots_funnel_step`).
>
> **Actualización (2026-07-06):** los eventos custom del host (vía `track(name, …)`) pasan a llevar prefijo **`deepdots_event_`** (p.ej. `track('add_to_cart')` → `deepdots_event_add_to_cart`), para poder identificarlos como eventos de usuario frente a los reservados del SDK. El SDK deja intactos los nombres que ya empiezan por `deepdots_`. El backend debe actualizar cualquier consulta que filtre por los nombres custom antiguos (sin prefijo).

### Campos raíz

| Campo | Tipo | Siempre presente | Descripción |
|---|---|---|---|
| `publicKey` | string | ✅ | Public key de la integración de analytics |
| `integration` | string | ✅ | ID de la integración en la plataforma |
| `completed` | boolean | ✅ | `false` en los lotes de streaming; **`true` solo en el ÚLTIMO lote de la sesión** (ver §7) |
| `finished` | boolean | ✅ | Siempre `false` (no es la señal de cierre) |
| `sessionId` | string | ❌ | Ausente en la primera llamada de cada sesión. Presente a partir de la segunda (devuelto por el backend). Agrupa los lotes de la misma sesión |

### `feedback.profile`

Identifica al usuario con un ID externo (del host, no del SDK).

| Key | Presente cuando |
|---|---|
| `external-user-id` | Solo si el host pasó `userId` en `init()`. Ausente para usuarios anónimos |

### `feedback.metadata` — formato de cada entrada

Todas las entradas usan `value: string[]` (array de un elemento):

```json
{ "key": "nombre_clave", "value": ["valor"] }
```

Para los eventos, `value[0]` es un **string JSON** que hay que parsear para acceder a timestamp y parámetros:

```json
{ "key": "deepdots_page_view", "value": ["{\"timestamp\":1750000000000,\"screen\":\"HomeScreen\",\"duration_seconds\":42}"] }
```

El campo `feedback.metrics` no se usa — todos los datos van en `feedback.metadata`.

### Campos de sistema (`deepdots_*`)

| Key | Valor de ejemplo | Plataforma | Descripción |
|---|---|---|---|
| `deepdots_user_id` | `"a3f2-b1c9-..."` | Web + KMP | ID persistente generado por el SDK |
| `deepdots_session_id` | `"67868972-..."` | Web + KMP | Session ID de popups (`POST /sdk/popups`). Null si no hubo popup |
| `deepdots_platform` | `"web"` / `"android"` / `"ios"` | Web + KMP | Plataforma del cliente |
| `deepdots_language` | `"es-ES"` | Web + KMP | Idioma del dispositivo/navegador |
| `deepdots_device_type` | `"mobile"` / `"tablet"` / `"desktop"` | Web + KMP | Tipo de dispositivo |
| `deepdots_os_version` | `"17.4"` | KMP | Versión del SO (solo nativo: `Build.VERSION.RELEASE` / `UIDevice.systemVersion`) |
| `deepdots_device_model` | `"iPhone"` | KMP | Modelo del dispositivo (solo nativo: `Build.MODEL` / `UIDevice.model`) |
| `deepdots_app_version` | `"2.1.0"` | Web + KMP | Versión de la app (pasada en `init()`) |
| `deepdots_user_agent` | `"Mozilla/5.0 ..."` | Web | UA completo del navegador (no aplica en nativo) |
| `deepdots_timezone` | `"Europe/Madrid"` | Web + KMP | Zona horaria. Web: `Intl.DateTimeFormat`; KMP: `TimeZone.getDefault()` / `NSDateFormatter` |
| `deepdots_screen_resolution` | `"1170x2532"` | Web + KMP | Resolución física en píxeles. Web: `screen.width×height`; KMP: `DisplayMetrics` / `UIScreen.nativeBounds` |
| `deepdots_viewport_size` | `"390x844"` | Web + KMP | Tamaño lógico. Web: `window.innerWidth×innerHeight`; KMP: píxeles/densidad / `UIScreen.bounds` |
| `deepdots_pixel_ratio` | `"3"` | Web + KMP | Densidad de píxeles. Web: `devicePixelRatio`; KMP: `DisplayMetrics.density` / `UIScreen.scale` |
| `deepdots_referrer` | `"https://google.com"` | Web | URL de origen (solo web, `document.referrer`). Ausente si acceso directo o nativo |
| `deepdots_entry_type` | `"navigate"` / `"reload"` / `"back_forward"` | Web | Tipo de navegación vía Performance API (solo web) |
| `deepdots_page_load_ms` | `"1240"` | Web | Tiempo de carga completa en ms vía Performance API (solo web) |
| `deepdots_connection_type` | `"wifi"` / `"4g"` / `"cellular"` | Web + KMP | Tipo de conexión. Web: Network Information API (Chrome); Android: `ConnectivityManager`; iOS: `SCNetworkReachability` + `CTTelephonyNetworkInfo` (tipo celular detallado) |
| `deepdots_country` | `"ES"` | Web + KMP | Código de país ISO por IP (ipapi.co, async — puede no estar en el primer lote) |
| `deepdots_city` | `"Madrid"` | Web + KMP | Ciudad por IP (ipapi.co, async — puede no estar en el primer lote) |

### Atributos del usuario (sin prefijo)

Cualquier clave sin prefijo `deepdots_` que no sea un evento es un atributo definido por el host vía `setUserAttributes()`. Son completamente libres. Ejemplos: `plan`, `sector`, `registration_status`, `age`.

### `feedback.answers`

Siempre un array vacío `[]`. Reservado para el modelo de surveys; no se usa en analytics.

### `feedback.text`

Siempre string vacío `""`.

---

## 3. Catálogo de eventos (entradas en `metadata` con key = nombre del evento)

### Eventos automáticos del SDK (con prefijo `deepdots_`)

#### `deepdots_page_view`
Se emite al salir de una pantalla. Registra el tiempo que el usuario estuvo en ella.

```json
{
  "timestamp": 1750000000000,
  "screen": "HomeScreen",
  "duration_seconds": 42,
  "mini_service": "checkout"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `timestamp` | number (ms) | Momento en que el usuario salió de la pantalla |
| `screen` | string | Nombre o ruta de la pantalla. En web se normaliza: sin query params, IDs/UUIDs → `:id` |
| `duration_seconds` | number | Segundos que el usuario estuvo en esa pantalla |
| `mini_service` | string? | Presente si había un mini-service activo durante la visita |

---

#### `deepdots_user_engagement`
Se emite en cada flush. Acumula el tiempo activo en primer plano desde el flush anterior.

```json
{
  "timestamp": 1750000005000,
  "engagement_time_msec": 38000,
  "mini_service": "checkout"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `timestamp` | number (ms) | Momento del flush |
| `engagement_time_msec` | number | Milisegundos de tiempo activo en foreground |
| `mini_service` | string? | Presente si había un mini-service activo |

---

#### `deepdots_mini_service_enter`
```json
{ "timestamp": 1750000010000, "mini_service": "checkout", "entry_point_type": "home_banner" }
```

#### `deepdots_mini_service_exit`
```json
{ "timestamp": 1750000070000, "mini_service": "checkout", "duration_seconds": 60 }
```

#### `deepdots_session_start`
Se emite al abrir sesión: en el `init()`, al volver a foreground tras un cierre, al conceder el consentimiento (`setTrackingEnabled(true)`) y tras un cambio de usuario. Base para Crash-Free Users (#14).
```json
{ "timestamp": 1750000000000 }
```

#### `deepdots_session_end`
Último evento de la sesión: viaja en el lote que lleva `completed: true` (ver §7). El `reason` dice qué lo provocó.
```json
{ "timestamp": 1750000090000, "reason": "page_hide" }
```
| `reason` | Cuándo |
|---|---|
| `page_hide` | La página web se cierra o se navega fuera (`pagehide`) |
| `background` | La app pasa a background (RN/nativo) |
| `user_change` | `setUserId()` o un `init()` con otro `userId` (login/logout) |
| `tracking_disabled` | `setTrackingEnabled(false)` (consentimiento revocado) |
| `manual` | El host llamó a `endSession()` |

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

> **Cobertura por plataforma:** Web captura errores JS no manejados (`window.onerror` / `unhandledrejection`) y `reportError()`. KMP captura excepciones gestionadas — Android `Thread.UncaughtExceptionHandler` (JVM), iOS `NSSetUncaughtExceptionHandler` (NSException) — y `reportError()`. En KMP `crashed_os_version`/`crashed_device_model` van poblados de forma nativa; en Web suelen ir vacíos. Los crashes nativos por señal (NDK / Mach) requieren captura nativa dedicada (plan posterior).
> **React Native:** captura errores del hilo JS vía `global.ErrorUtils` (enganchado por `setupReactNative`) + `reportError()`. Los crashes nativos bajo RN requieren captura nativa dedicada (no incluida).

---

### Eventos del host con helpers del SDK (prefijo `deepdots_`)

#### `deepdots_search`
```json
{ "timestamp": 1750000020000, "query": "zapatillas running", "results_count": 0, "has_results": false }
```

#### `deepdots_findability_friction`
```json
{ "timestamp": 1750000025000, "friction_topic": "checkout_address" }
```

#### `deepdots_funnel_step`
```json
{ "timestamp": 1750000030000, "funnel": "onboarding", "step": "profile_completed", "task_id": "task-42" }
```

El backend puede agrupar por `funnel` + `task_id` para calcular tasas de conversión entre pasos.

#### `deepdots_message`
Etapa del funnel de una notificación del host (push / in-app). Un único evento con un campo `stage` discriminador; el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
```json
{ "timestamp": 1750000040000, "stage": "clicked", "message_id": "msg-42", "message_title": "Rebajas de verano", "channel": "push", "campaign": "summer_sale", "value": 49.9, "currency": "EUR" }
```

| Campo | Valores | Descripción |
|---|---|---|
| `stage` | `delivered` / `clicked` / `converted` | Etapa del funnel del mensaje |
| `message_id` | string | Correlaciona las etapas del mismo mensaje |
| `message_title` | string | Dimensión de agrupación de #18–22 |
| `channel` | `push` / `in_app` | Canal de entrega |
| `campaign` | string? | Campaña (opcional) |
| `value` / `currency` | number / string | Valor de conversión (típico en `converted`) |

**Derivación de Messaging (#18–22)** — group by `message_title`, breakdown por `registration_status` del contexto y opcionalmente `channel`:
- **#18 Messages Delivered** = `count(stage='delivered')`
- **#19 CTR** = `count(stage='clicked') / count(stage='delivered')`
- **#20 Unique Click-Through Users** = `user_id` distintos con `stage='clicked'`
- **#21 Conversion Rate** = `count(stage='converted') / count(stage='delivered')`
- **#22 Action Users** = `user_id` distintos con `stage IN ('clicked','converted')`

> **Nota:** Messaging es host-instrumentado (`trackMessage`). Cubre push + in-app; para push, el "delivered" real puede venir mejor del proveedor/backend.

**Protecciones del SDK (⚠️ 2026-07-30).** A raíz de CTR/conversion imposibles en BQ (300%, 700%), `trackMessage` descarta —con `console.warn`— los eventos malformados antes de encolarlos, así que estas formas ya no pueden llegar al backend desde un SDK ≥ esta versión:

| Regla | Qué se descarta | `reason` del warning |
|---|---|---|
| `channel` debe ser `push` o `in_app` | Cualquier otro valor (p. ej. `"PUSH"`, `"email"`) | `invalid_channel` |
| Un `(message_id, stage)` se emite una vez por sesión | La 2ª y siguientes llamadas al mismo stage del mismo mensaje | `duplicate_stage` |
| Un `message_id` tiene UN canal | Eventos de un canal distinto al primero visto para ese `message_id` | `channel_conflict` |

Vigencia: la **sesión** (se reinicia en cada `init()`), con un techo de 500 `message_id` vigilados (los más antiguos se evictan). Un evento rechazado no consume estado: tras un `channel_conflict` en `in_app`, el mismo stage en el canal correcto sí se emite.

Lo que el SDK **no** puede arreglar: la ausencia de `delivered`. Es host-instrumentado y en push solo es observable si el proceso de la app recibe la notificación (data/silent push en Android, `UNNotificationServiceExtension` en iOS) → medido en cliente queda estructuralmente por debajo del real. El denominador fiable de #18/#19/#21 debería venir del proveedor de envío. Mientras tanto el dashboard debe mostrar `n/d` (no un porcentaje) cuando `delivered = 0`.

⚠️ Estas reglas son **por sesión y por dispositivo**: no sustituyen el dedupe de backend por `(deepdots_user_id, nombre_evento, timestamp)` (§6), que es lo que cubre los reenvíos at-least-once.

#### Eventos custom (`track(name, params)`)
El host puede emitir cualquier evento libre. La única estructura garantizada es `timestamp`.

```json
{ "timestamp": 1750000035000, "product_id": "p-123", "value": 49.9, "currency": "EUR" }
```

> Todos los eventos pueden incluir `mini_service: "nombre"` si se emitieron dentro de un mini-service activo.

---

## 4. Respuesta esperada del backend

```json
{ "sessionId": "67868972-1864-40a2-9abd-030529aeac33" }
```

El SDK cachea este `sessionId` y lo incluye en el body de todas las llamadas siguientes de la misma sesión (hasta el próximo `init()`).

---

## 5. Modelo de identidad

| Concepto | Campo | Quién lo genera | Persiste entre sesiones |
|---|---|---|---|
| **Usuario anónimo** | `metadata.deepdots_user_id` | SDK (UUID) | ✅ localStorage / SharedPreferences |
| **Usuario identificado** | `profile.external-user-id` | Host (`init({ userId })`) | ❌ El host lo provee siempre |
| **Sesión de popups** | `metadata.deepdots_session_id` | Backend (`POST /sdk/popups`) | ❌ Por sesión de navegación |
| **Sesión de analytics** | `sessionId` (raíz) | Backend (`POST /sdk/feedback`) | ❌ Por sesión de app / `init()` |

El `deepdots_user_id` es la clave principal para cruzar datos entre sesiones y entre el canal de popups y el canal de analytics.

---

## 6. Notas de implementación

- **Distinguir campos del sistema**: todas las claves `deepdots_*` son del SDK; el resto son del host (atributos o eventos).
- **`deepdots_country` / `deepdots_city`**: se resuelven de forma asíncrona vía `ipapi.co`. Pueden **no estar presentes en el primer lote** del flush si la respuesta geo aún no llegó. Aparecerán en lotes posteriores de la misma sesión.
- **Un lote puede llegar vacío si no hubo eventos**: el SDK tiene una guarda (`events.length === 0 → no flush`), pero el backend debería ser tolerante igualmente.
- **Entrega at-least-once (⚠️ 2026-07-28)**: si el POST falla por red o responde **5xx / 408 / 429**, el SDK **re-encola el lote** y lo reenvía en el flush siguiente. Si el fallo ocurrió después de que el backend procesara los eventos, esos eventos **llegarán dos veces**. El backend debe deduplicar por `(deepdots_user_id, nombre_evento, timestamp)`, que identifica un evento de forma única. Un **4xx** (payload/claves inválidas, Contact) NO se reintenta: se loguea y el lote se descarta.
- **Respuestas de error**: el SDK loguea el status y el cuerpo (500 primeros caracteres) cuando `debug: true`. Devolver un mensaje de error legible ayuda a diagnosticar en cliente.
- **Último lote de la sesión vía `sendBeacon`**: el flush del cierre de página se envía con `navigator.sendBeacon`, que sobrevive al unload pero **no permite leer la respuesta**. Consecuencias: (1) ese lote llega con `Content-Type: application/json` pero puede no traer `sessionId` si aún no se conocía → el backend debe coser por `deepdots_user_id`; (2) el `sessionId` de esa respuesta se descarta. Los lotes normales van por `fetch` con `keepalive`.
- **Serialización del primer lote**: hasta conocer el `sessionId`, el SDK no manda un segundo lote en paralelo (evita crear dos registros para la misma sesión). Cuanto antes responda el primer POST, antes fluyen los siguientes.
- **Atributos de usuario en `metadata`** pueden variar entre lotes si el host llama a `setUserAttributes()` varias veces — el valor del último lote es el más reciente.
- **`mini_service` en eventos**: cualquier evento emitido mientras hay un mini-service activo incluirá `mini_service: "nombre"` en sus parámetros.
- **Normalización de rutas web**: el SDK reemplaza segmentos numéricos y UUIDs por `:id` (e.g. `/orders/123` → `/orders/:id`). En React Native la pantalla es el nombre tal como lo pasa el host.
- **`finished` siempre `false`**; el cierre de sesión se señaliza solo con `completed` (§7).
- **Stability (#14–17)** se derivan de estos eventos: **#14 Crash-Free Users** = 1 − (sesiones con `deepdots_app_crash` / sesiones con `deepdots_session_start`); **#15 Latest Release** = crashes filtrados por el `crashed_app_version` más reciente (del propio evento); **#16 Breakdown** = group by `crash_type` × `crashed_os_version` × `crashed_device_model` × `crashed_app_version`; **#17 Summary** = totales. La simbolización del stack (dSYM / mapping) es responsabilidad de backend + pipeline de build, no del SDK.

---

## 7. Cierre de sesión (`completed: true`)

Desde 2026-07-30 el SDK **marca el final de la sesión**. El último lote de una sesión sale con:

```json
{ "completed": true, "sessionId": "<el de la sesión que se cierra>", "feedback": { "finished": false, "…": "…" } }
```

Ese lote contiene, en este orden, todo lo que quedaba abierto: el `deepdots_page_view` de la
pantalla actual, los `deepdots_mini_service_exit` pendientes, el `deepdots_user_engagement`
acumulado y por último `deepdots_session_end` con su `reason`.

**Contrato:**

1. `completed: true` **cierra el registro** identificado por ese `sessionId`. No llegarán más eventos con él.
2. El SDK **olvida el `sessionId`** tras cerrar: el lote siguiente llega **sin `sessionId`** y el backend debe **abrir un registro nuevo** (y devolver un `sessionId` nuevo en la respuesta).
3. `feedback.finished` sigue siendo `false` siempre — `completed` es la única señal de cierre.
4. El POST de cierre puede ir por `sendBeacon` (cierre de página): su respuesta **no se lee**, así que el `sessionId` que devuelva se descarta.

### Cuándo se cierra la sesión

| Señal | Plataforma | Fiabilidad |
|---|---|---|
| `pagehide` | Web | Alta. En Safari iOS puede no dispararse si el SO mata la pestaña |
| `AppState → background` | RN / nativo | Alta. `inactive` (llamada entrante, app switcher) **no** cierra: solo hace flush |
| `setUserId()` / `init()` con otro `userId` | Todas | Total (lo dispara el host) |
| `setTrackingEnabled(false)` | Todas | Total |
| `endSession()` | Todas | Total |

### ⚠️ El backend necesita igualmente una ventana de inactividad

Hay cierres que **ningún SDK puede detectar**: kill de la app por el usuario o por el SO
(no hay callback ni en iOS ni en Android), crash del proceso, pérdida de conexión, apagón.
En esos casos el registro se queda **abierto sin `completed: true`**. El backend debe cerrarlo
por inactividad (p. ej. sin eventos durante X minutos). `completed: true` es una señal
**oportunista** que permite cerrar antes y con datos completos, no una garantía.

### Impacto en el conteo de sesiones

Con esto, "sesión" pasa a tener un límite explícito: un `deepdots_session_start` … `deepdots_session_end`.
En móvil, cada ida a background cierra sesión y cada vuelta a foreground abre otra — es el
comportamiento de GA con `session_start`, salvo que aquí no hay ventana de gracia de 30 min.
Si se prefiere reanudar la sesión anterior cuando la vuelta es inmediata, la ventana la tiene
que aplicar el backend (mismo `deepdots_user_id`, hueco < N minutos → fusionar).
