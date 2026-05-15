---
title: API
description: Métodos públicos y opciones que expone @magicfeedback/native.
---

El default export del paquete es el **singleton del SDK**. Úsalo directamente — no hay `new`.

```ts
import magicfeedback from "@magicfeedback/native";
```

## `init(options?)`

Configura el SDK. Llámalo una vez antes que cualquier otro método.

```ts
magicfeedback.init({
  env: "prod",
  debug: false,
  dryRun: false,
});
```

| Opción   | Tipo                  | Por defecto | Descripción                                                                  |
| -------- | --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `env`    | `"prod" \| "dev"`     | `"prod"`    | Selecciona el host de API de producción o desarrollo.                        |
| `debug`  | `boolean`             | `false`     | Activa los logs del SDK en consola.                                          |
| `dryRun` | `boolean`             | `false`     | Carga y navega los formularios sin enviar feedback ni pedir follow-ups.      |

`dryRun` es la forma más segura de hacer QA de una encuesta antes de entregarla a un cliente.

## `form(appId, publicKey, profile?, metadata?)`

Crea una instancia de formulario asociada a una integración.

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
```

`profile` y `metadata` opcionales se anteponen a cada envío de este formulario.

## `session(sessionId)`

Reanuda una sesión existente.

```ts
const form = magicfeedback.session("SESSION_ID");
```

Devuelve el mismo tipo `Form` que `form(...)` — renderízalo con `form.generate(...)`.

## `send(appId, publicKey, feedback, completed?, id?, privateKey?)`

Envía feedback directamente sin renderizar UI. Úsalo cuando **tú gestionas la UI** y solo quieres que el SDK entregue las respuestas.

```ts
await magicfeedback.send(
  "APP_ID",
  "PUBLIC_KEY",
  {
    text: "",
    answers: [
      { key: "nps", value: ["9"] },
      { key: "favorite-feature", value: ["Conditional logic"] },
    ],
    metadata: [{ key: "source", value: ["pricing-page"] }],
    metrics:  [{ key: "plan",   value: ["pro"] }],
    profile:  [{ key: "email",  value: ["user@example.com"] }],
  },
  true, // completed
);
```

`completed: false` está pensado para guardados parciales de flujos multi-paso.

## `previewPage(selector, input, options?)`

Renderiza una página (con sus preguntas) del creator **sin tocar la API** ni persistir respuestas. Lo usa el dashboard de MagicFeedback para previsualizar en vivo.

```ts
await magicfeedback.previewPage("preview-root", {
  page: { /* definición de la página */ },
  language: "es",
});
```

`dryRun` está activado internamente — no se envía `POST /feedback`.

---

## Métodos de `Form`

El objeto que devuelve `form(...)` y `session(...)`.

### `form.generate(containerId, options?)`

Renderiza el formulario dentro del elemento del DOM cuyo **id** le pases (no un selector CSS).

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Enviar",
  backButtonText: "Atrás",
  nextButtonText: "Siguiente",
  startButtonText: "¡Empezar!",
  addSuccessScreen: true,
  successMessage: "¡Gracias por tu feedback!",
  questionFormat: "standard",
  getMetaData: true,
  customMetaData: [
    { key: "customer-id", value: ["acme-42"] },
    { key: "plan",        value: ["enterprise"] },
  ],
  onLoadedEvent:     ({ formData, progress, total, error }) => {},
  beforeSubmitEvent: ({ progress, total }) => {},
  afterSubmitEvent:  ({ response, progress, total, completed, followup, error }) => {},
  onBackEvent:       ({ progress, followup, error }) => {},
});
```

| Opción              | Por defecto                            | Descripción                                                                |
| ------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `addButton`         | `true`                                 | Renderiza los botones de acción integrados. Desactívalo para controlar la navegación tú. |
| `sendButtonText`    | `"Send"`                               | Label del botón final de submit.                                           |
| `backButtonText`    | `"Back"`                               | Label del botón atrás.                                                     |
| `nextButtonText`    | `"Next"`                               | Label del botón siguiente en flujos multi-paso.                            |
| `startButtonText`   | `"Go!"`                                | Label del botón de inicio cuando el formulario tiene start message.        |
| `addSuccessScreen`  | `true`                                 | Muestra la vista de éxito integrada al terminar el flujo.                  |
| `successMessage`    | `"Thank you for your feedback!"`       | Texto de éxito personalizado.                                              |
| `questionFormat`    | `"standard"`                           | `"standard"` o `"slim"`. Mira [Customization](/es/guides/customization/).  |
| `getMetaData`       | `true`                                 | Añade metadata de navegador y página automáticamente.                      |
| `customMetaData`    | `[]`                                   | Metadata extra fusionada en `feedback.metadata`.                           |
| `onLoadedEvent`     | `undefined`                            | Se llama tras montar el formulario o la pantalla de inicio.                |
| `beforeSubmitEvent` | `undefined`                            | Se llama antes de enviar una página.                                       |
| `afterSubmitEvent`  | `undefined`                            | Se llama tras enviar una página, renderizar follow-up o completar.         |
| `onBackEvent`       | `undefined`                            | Se llama tras navegar atrás.                                               |

Con `getMetaData: true`, el SDK añade: URL actual, origin, pathname, query string, user agent, idioma del navegador, plataforma, app metadata, tamaño de pantalla y el session id si renderizas desde `session()`. Los query params se expanden como `query-<param>`.

### `form.send(metadata?, metrics?, profile?, answers?)`

Envía la **página actual**.

Por defecto, el SDK escanea las preguntas renderizadas del DOM, valida los campos obligatorios y envía lo que el usuario haya introducido en los widgets integrados. Usa esta llamada cuando hayas puesto `addButton: false` y quieras controlar tu propio next/back.

```ts
form.send(
  [{ key: "source", value: ["pricing-page"] }], // metadata
  [{ key: "score",  value: ["92"] }],           // metrics
  [{ key: "email",  value: ["user@example.com"] }], // profile
);
```

#### Respuestas programáticas — controla la encuesta desde tus propios widgets

> **Disponible desde 2.2.4.**

Pasa un cuarto argumento `answers` para **saltarte el escaneo del DOM y la validación de campos obligatorios** por completo. El SDK añade tus respuestas directamente a `feedback.answers` y las envía.

Esto habilita una UI totalmente custom: renderiza tus propios inputs (en cualquier framework, con cualquier librería de componentes), recoge tú las respuestas, y deja que el SDK se encargue de red y eventos de ciclo de vida.

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");

// Opcional: salta generate() si no quieres que el SDK renderice nada.
// Aun así necesitas la instancia del form para mantener el estado de sesión.

await form.send(
  [{ key: "source", value: ["custom-ui"] }], // metadata
  [{ key: "plan",   value: ["pro"] }],       // metrics
  [],                                        // profile
  [
    { key: "nps",              value: ["9"] },
    { key: "favorite-feature", value: ["Conditional logic"] },
  ],
);
```

Los hooks de ciclo de vida (`beforeSubmitEvent`, `afterSubmitEvent`) siguen disparándose en la vía programática, así que analítica y UX continúan funcionando igual que con los widgets renderizados.

:::caution
La llamada programática de `form.send()` siempre envía con `completed: false` (guardado parcial). Si necesitas marcar un envío de un solo paso como completado, usa el método de alto nivel [`magicfeedback.send(...)`](#sendappid-publickey-feedback-completed-id-privatekey) que acepta el flag `completed` de forma explícita.
:::

:::tip
Es la llamada adecuada cuando tu producto ya tiene un design system fuerte y no quieres ningún widget renderizado por el SDK en pantalla. Para flujos mixtos — widgets del SDK más tu propia barra de acciones — llama a `form.send()` sin el cuarto argumento y deja que el SDK escanee sus propios widgets.
:::

### `form.back()`

Navega a la página anterior. Úsalo cuando `addButton: false`.

```ts
form.back();
```

### `form.previewQuestion(containerId, question, options?)`

Renderiza una sola pregunta sin cambiar el estado interno del flujo. Útil para QA, demos locales y regresión visual.

```ts
form.previewQuestion("preview-root", {
  id: "q_text",
  title: "¿Cómo te llamas?",
  type: "TEXT",
  questionType: { conf: [] },
  ref: "name",
  require: true,
  external_id: "",
  value: [],
  defaultValue: "",
  followup: false,
  position: 1,
  assets: { placeholder: "Escribe tu nombre" },
  refMetric: "",
  integrationId: "demo",
  integrationPageId: "demo",
}, {
  format: "standard",
  language: "es",
  product: { customIcons: false },
  clearContainer: true,
  wrap: true,
});
```

---

## Tipos de pregunta soportados

El renderer soporta actualmente estos tipos de pregunta:

`TEXT`, `LONGTEXT`, `NUMBER`, `RADIO`, `MULTIPLECHOICE`, `SELECT`, `DATE`, `EMAIL`, `PASSWORD`, `BOOLEAN`, `CONSENT`, `RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`, `MULTIPLECHOISE_IMAGE`, `MULTI_QUESTION_MATRIX`, `POINT_SYSTEM`, `PRIORITY_LIST`, `INFO_PAGE`, `UPLOAD_FILE`, `UPLOAD_IMAGE`.

### Notas sobre el payload

- Las respuestas `EMAIL` también se copian en `feedback.profile` como `email`.
- Las respuestas `POINT_SYSTEM` se serializan como `"Label:60%"`.
- Las respuestas `MULTI_QUESTION_MATRIX` se agrupan en una sola entrada JSON. Las matrices requeridas deben tener un valor en cada fila antes de permitir el envío.
- `INFO_PAGE`, `UPLOAD_FILE` y `UPLOAD_IMAGE` se renderizan pero **no** crean entradas de respuesta.

Para el JSON exacto que produce `Form.answer()`, mira `docs/answer-format.md` en el repo del SDK.

---

## TypeScript

El paquete distribuye los tipos en `dist/types/src/index.d.ts`. El default export está totalmente tipado — no necesitas imports extra para autocompletado y type-checking.

```ts
import magicfeedback from "@magicfeedback/native";

const form = magicfeedback.form("APP_ID", "PUBLIC_KEY"); // tipado
await form.generate("survey-root", {
  addButton: true,
  afterSubmitEvent: (e) => console.log(e.completed),     // tipado
});
```
