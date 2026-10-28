# SDK test app (MF-3243 · MF-3245)

Una tienda de prueba, **NORDLY**, que integra `@magicfeedback/popup-sdk` como lo haría un
cliente, con una barra **SDK Lab** encima para elegir qué se prueba. Es la base de la
regresión funcional (MF-3245) y de la visual (MF-3247).

- Carga el artefacto **publicado** en npm (vía jsDelivr) o la build local de este repo.
- Va siempre contra **DEV** (`api-dev.deepdots.com`) y la compañía **MAGICFEEDBACK_DEV**. Bloquea
  cualquier petición a producción, y la suite falla si sale alguna.
- Está en castellano y en inglés, con un selector ES/EN en la cabecera.

```bash
npm run test-app                         # http://localhost:5180
npm run test-app:e2e                     # suite contra la latest de npm
SDK_VERSION=1.16.1 npm run test-app:e2e  # contra otra versión
npm run build && SDK_VERSION=local npm run test-app:e2e
```

## Parámetros (query de la URL)

Todo el run cabe en un enlace. La barra **Configure** los cambia y recarga.

| Parámetro | Valores | Qué hace |
|---|---|---|
| `sdk` | `latest` · `local` · `X.Y.Z` | Versión del SDK. `latest` se resuelve a una versión exacta antes de importarla. |
| `scenario` | `all` · `checkout-time` · `exit-checkout` · `rate-product` · `help-click` · `redisplay` · `not-on-cart` · `release-fixtures` | Popups que devuelve la API (ver abajo). |
| `popups` | `fixture` · `live` | `fixture`: el service worker sirve `app/scenarios.json` (determinista). `live`: la config real de DEV. |
| `fault` | `none` · `survey406` · `network` · `popups500` · `sdk-cdn` · `slow` · `popups-slow` · `popups-timeout` · `events500` · `survey-garbage` | Fallo inyectado en la red (ver «Fallos» abajo). |
| `survey` | `dev` · `fixture` | `fixture`: la encuesta sale de `app/fixtures/surveys` y las respuestas se contestan en local. |
| `pos` | vacío · `center` · `bottom` · `bottom-right` · … | Fuerza la posición de todos los popups del escenario. |
| `init` | `once` · `twice` | `twice`: el host llama a `init()` + `autoLaunch()` dos veces (React StrictMode). |
| `nav` | `history` · `silent` | `silent`: el router cambia la vista sin History API, así que el SDK no se entera de la navegación. |
| `load` | `immediate` · `consent` · `delayed` | Cuándo carga el SDK: al arrancar, tras aceptar cookies o a los 2 s. |
| `css` | `competing` · `clean` | `competing` añade CSS del host que compite con el del popup (`app/styles/competing.css`). |
| `lang` | `es` · `en` | Idioma de la tienda y `language` del SDK. |
| `user` | texto | `userId` del `init()`. Si se omite, el SDK usa su id anónimo. |
| `debug` | `0` · `1` | `debug` del SDK. |

**Reset** borra el `localStorage` (cooldowns, carrito, consentimiento) y recarga la página.

## Escenarios

`scripts/build-scenarios.mjs` genera `app/scenarios.json` y es la fuente única de los popups.
Cada popup existe en dos variantes, `-es` y `-en`, segmentadas por `segments.lang`.

| Escenario | Trigger | Targeting | Encuesta |
|---|---|---|---|
| `checkout-time` | `time_on_page` 3 s | `path: /checkout` | simple |
| `exit-checkout` | `exit` 2 s | sale de `/checkout` | simple |
| `rate-product` | `event` `rate_product` (botón «Valorar») | — | compleja |
| `help-click` | `click` `#help-button` (footer) | — | simple |
| `redisplay` | `time_on_page` 2 s | `path: /account`, cooldown `SHOWED` 1 día | simple |
| `not-on-cart` | `time_on_page` 2 s | `excludedPaths: /cart, /checkout` | simple |
| `scroll-products` | `scroll` 50 % | `path: /products` | simple |
| `release-fixtures` | los de `release/compatibility.json` | — | (inventadas) |

## Cómo funciona

- **`app/main.js`** arranca el service worker, la tienda y el SDK. El SDK se usa como en un
  cliente: `import()` del paquete, `init({ apiKey, nodeEnv: 'development', language })` y
  `autoLaunch()`.
- **`sw.js`** es la red del laboratorio:
  - sirve los fixtures;
  - inyecta los fallos;
  - bloquea producción;
  - cuenta cada petición al panel *Network*.

  Va en un service worker porque `@magicfeedback/native` envía con `XMLHttpRequest`, y un parche
  de `fetch` no lo vería. Con `popups=fixture`, los estados de popup y el analytics se contestan
  en local. Las respuestas de encuesta sí llegan a la integración de DEV.
- **`app/popup-watch.js`** mira el popup desde fuera, a través del DOM de
  `#deepdots-popup-container`. Así funciona con cualquier versión.
- **`window.__lab`** es el contrato con los tests: `ready`, `sdkVersion`, `events[]`,
  `network[]`, `params`, `popupVisible()`. Todo se registra también en la consola con el prefijo
  `[lab]`, que es lo que acaba en el log del CI.

## Suite (`e2e/`)

- `smoke.spec.ts`: versión y entorno; un test por tipo de trigger y de targeting; re-display;
  multidioma; CSS y overlays del host; config real de DEV.
- `failures.spec.ts`: los failure tests obligatorios.
  - **Sin evento de navegación** (`nav=silent`): el exit trigger no salta y el test lo detecta.
    Lleva `test.fail()`: si un día pasara, se pondría en rojo.
  - **Fallo de carga del popup** (406, error de red, 500 en popups, CDN caído): la tienda sigue
    usable. Lo comprueba con clics reales: navegar y añadir al carrito.
- `release-fixtures.spec.ts`: los fixtures de MF-3241 contra el paquete publicado.

- `regression/`: la regresión funcional de MF-3245 (ver abajo).

El CI (`.github/workflows/test-app.yml`) lanza un job por versión: `local`, `latest` y `1.16.1`
(los lunes, además, `1.15.0`). Con *Run workflow* se puede pasar otra lista y grabar vídeo. El
resumen del job tiene una tabla por proyecto (plataforma + versión) con los tests que pasan, los
que fallan y los bugs conocidos que ha detectado.

## Regresión funcional (MF-3245)

`e2e/regression/` prueba el comportamiento del SDK dentro del host, no el renderer de la
encuesta. Corre en dos proyectos: escritorio (todo) y móvil, Pixel 7 táctil (`popup-ui` y
`host-safety`).

| Spec | Qué cubre |
|---|---|
| `init` | Un GET de popups por carga; init + autoLaunch dos veces sin duplicar; carga tras el consentimiento; evento del host antes de que lleguen las definiciones. |
| `navigation` | pushState y atrás del navegador; salir de la ruta antes de que venza el tiempo; ida y vuelta antes del exit; **navegación rápida → un solo exit** (failure test); navegar con el popup abierto. |
| `triggers` | Tiempo y scroll con reloj falso; doble clic; el mismo evento 5 veces; dos popups distintos a la vez. |
| `redisplay` | Cooldown SHOWED (1 día) y COMPLETED (30 días) con reloj falso; dos pestañas; idioma + rutas excluidas. |
| `popup-ui` | Las 7 posiciones dentro del viewport y ancladas; redimensionar con el popup abierto; cerrar; envío real a DEV. |
| `host-safety` | **Popup en esquina: los clics fuera de la tarjeta llegan al host** (failure test); nada queda tras cerrar; encuesta lenta; offline; API de popups colgada; 500 en eventos; encuesta corrupta; ráfaga de navegación. |

Lo que comprueba cada test aunque no lo diga (`regression/fixtures.ts`):

- **Popups esperados.** El test declara qué popups tienen que salir en la última carga de la
  página (`rlab.expectPopups`). Al terminar se compara con los `popup_shown` reales: uno de más,
  uno de menos o uno duplicado lo ponen en rojo.
- **Errores sin capturar.** Un `pageerror` en la página es un fallo.
- **Capas invisibles.** `interceptedPoints()` recorre una rejilla del viewport con
  `elementFromPoint` y devuelve los puntos donde el contenedor del SDK está encima del host sin
  ser la tarjeta ni un velo visible.
- **Plataforma y versión** en el reporte (anotaciones `platform`, `sdk`).

Determinismo: los popups y la encuesta son fixtures del service worker (solo el envío de
`popup-ui` va a DEV), y los tiempos y cooldowns van con el reloj falso de Playwright
(`page.clock`, `rlab.freeze()` / `rlab.advance()`). En CI la regresión corre con 0 reintentos.
Trace y vídeo se guardan de cada test que falla.

### Bugs conocidos

`KNOWN_BUGS` en `regression/fixtures.ts`: el test del bug lleva `test.fail()` mientras la versión
probada lo tenga. Si pasa, se pone en rojo para quitar la marca. Al arreglarlo, `fixedIn: 'local'`
en la PR del arreglo y la versión publicada (`'1.17.2'`) cuando salga.

| Bug | Qué pasa |
|---|---|
| `corner-overlay` | Con el popup en una esquina, `#deepdots-popup-container` sigue ocupando toda la pantalla (transparente) y se come todos los clics del host. |
| `duplicate-shown` | El mismo popup disparado otra vez mientras está abierto (o un exit encolado varias veces al navegar rápido) emite otro `popup_shown` y otro POST SHOWED; solo se ve uno. |
| `phantom-shown` | Si otro popup toca con uno abierto, emite `popup_shown` + SHOWED y guarda su `lastShown` (gasta el cooldown) sin llegar a pintarse. |

### Fallos inyectados

| `fault` | Qué hace el service worker |
|---|---|
| `slow` | La encuesta tarda 4 s. |
| `popups-slow` | El GET de popups tarda 3 s. |
| `popups-timeout` | El GET de popups no contesta nunca. |
| `events500` | 500 en `POST /sdk/popups` y `/sdk/feedback`. |
| `survey-garbage` | La encuesta contesta 200 con un cuerpo que no es JSON. |

Encuestas de fixture: `node apps/test-app/scripts/record-surveys.mjs` las vuelve a grabar de DEV.

⚠️ Fuera del CI Playwright reutiliza un servidor que ya esté en el puerto. Si otra copia de la
test app ocupa el 5180, la suite prueba esa: `TEST_APP_PORT=5191 npm run test-app:e2e`.

## Fixtures en DEV

Creados el 28-oct-2026 en MAGICFEEDBACK_DEV. Son públicos: es lo que llevaría la web de un
cliente. Están en `app/config.js`.

| Qué | Id |
|---|---|
| Encuesta «SDK Test App · Simple» (es, en) | `5581b5a0-d2df-11f1-b287-1be76c3f931d` |
| Encuesta «SDK Test App · Complex» (es, en) | `7c78d670-d2df-11f1-b287-1be76c3f931d` |
| Producto (`productId` del popup = su publicKey) | `MAGICFEEDBACK_DEV_GENERAL` |
| Config de popups «SDK Test App (MF-3243)», 10 popups = escenario `all` | `b32bd410-d2df-11f1-b287-1be76c3f931d` |

Si cambias `scenarios.json`, actualiza también esa config en el Admin Panel de DEV, o
`popups=live` dejará de coincidir con los fixtures.

## Hallazgos conocidos

- **La burbuja de chat del host tapa la X de un popup abajo a la derecha.** El contenedor del
  popup va con z-index 999999, y los widgets de chat suelen ir en 2147483000. Hay un test con
  `test.fail()`.
- **`h2 { … !important }` del host se cuela en el título del popup.** Se ve con `css=competing`;
  queda para la regresión visual (MF-3247).
- **`segments.path` con hash (`/#/game`) no coincide si la URL lleva query antes del hash.** El
  candidato se busca como subcadena del href.
- **1.14.0 y anteriores no avisan si la encuesta no carga.** El popup sale vacío, con «Enviar».
  Se arregló en la 1.16.0, y `failures.spec.ts` lo detecta en esas versiones.
- **(Arreglado en MF-3245, era de la test app.)** El service worker tomaba el último POST de la
  encuesta (`completed: true`, sin respuestas) por analytics y lo contestaba con `{}`: con
  `survey=dev` la encuesta nunca se completaba y salía el error genérico de envío. Ahora se
  reconoce por la `integration` de la encuesta.
