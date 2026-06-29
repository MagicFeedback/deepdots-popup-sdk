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
      { "key": "add_to_cart",        "value": ["{\"timestamp\":1750000010000,\"product_id\":\"p-99\",\"value\":49.9}"] }
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
| *(sin prefijo)* | Eventos custom del host vía `track()` | `add_to_cart`, `checkout_started` |

El prefijo `deepdots_` garantiza que los campos del sistema **nunca colisionen** con los del host.

> **Breaking change (2026-06-29):** todos los eventos generados por el SDK pasan a llevar prefijo `deepdots_` (`deepdots_page_view`, `deepdots_user_engagement`, `deepdots_mini_service_enter/exit`, `deepdots_search`, `deepdots_findability_friction`, `deepdots_funnel_step`). Solo los eventos custom del host (vía `track(name, …)`) van sin prefijo. El backend debe actualizar cualquier consulta que filtre por los nombres antiguos.

### Campos raíz

| Campo | Tipo | Siempre presente | Descripción |
|---|---|---|---|
| `publicKey` | string | ✅ | Public key de la integración de analytics |
| `integration` | string | ✅ | ID de la integración en la plataforma |
| `completed` | boolean | ✅ | Siempre `false` — modelo de streaming, nunca se cierra |
| `finished` | boolean | ✅ | Siempre `false` |
| `sessionId` | string | ❌ | Ausente en la primera llamada. Presente a partir de la segunda (devuelto por el backend). Agrupa los lotes de la misma sesión |

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
- **Atributos de usuario en `metadata`** pueden variar entre lotes si el host llama a `setUserAttributes()` varias veces — el valor del último lote es el más reciente.
- **`mini_service` en eventos**: cualquier evento emitido mientras hay un mini-service activo incluirá `mini_service: "nombre"` en sus parámetros.
- **Normalización de rutas web**: el SDK reemplaza segmentos numéricos y UUIDs por `:id` (e.g. `/orders/123` → `/orders/:id`). En React Native la pantalla es el nombre tal como lo pasa el host.
- **`completed` y `finished` siempre `false`**: modelo de streaming; el backend debe acumular sin esperar un cierre.
- **Stability (#14–17)** se derivan de estos eventos: **#14 Crash-Free Users** = 1 − (sesiones con `deepdots_app_crash` / sesiones con `deepdots_session_start`); **#15 Latest Release** = crashes filtrados por el `crashed_app_version` más reciente (del propio evento); **#16 Breakdown** = group by `crash_type` × `crashed_os_version` × `crashed_device_model` × `crashed_app_version`; **#17 Summary** = totales. La simbolización del stack (dSYM / mapping) es responsabilidad de backend + pipeline de build, no del SDK.
