---
title: Customization
description: Cómo se renderiza la encuesta y todas las capas de personalización de UI que expone el SDK.
---

## Cómo se renderiza la encuesta

> **¿La encuesta se renderiza dentro de un WebView? ¿Podemos personalizar la UI?**

En la web, la encuesta **no** se renderiza dentro de un WebView. El SDK inyecta la encuesta directamente en el DOM de tu página, dentro del elemento contenedor que pasas a `form.generate(...)`. Eso significa que:

- Es parte del **mismo árbol DOM que tu app**.
- Se puede estilar con tu propio CSS e inspeccionar con las DevTools del navegador.
- Hereda la pila de fuentes, las preferencias de accesibilidad y `prefers-reduced-motion` de tu página.
- **No hay iframe** ni **sandbox**.

En **React Native**, la vía recomendada es diferente — mira [React Native](/es/reference/react-native/) — y ahí sí se ejecuta dentro de un `WebView` porque RN no tiene DOM. Es un requisito del host, no una limitación del SDK.

Tienes **tres capas independientes de personalización** en la web: variables CSS, labels de botones de acción y overrides de las clases CSS generadas para control visual completo.

---

## Cargar la hoja de estilos por defecto

El SDK distribuye su look-and-feel completo en una sola hoja de estilos en `@magicfeedback/native/dist/styles/magicfeedback-default.css`. El formulario **requiere** esta hoja de estilos para renderizar correctamente — cárgala una vez en el punto de entrada de tu app y añade tus overrides debajo.

Elige el snippet que se ajuste a tu integración.

### Bundler (Vite / Webpack / Rollup / esbuild)

```ts
// main.ts / index.ts / app.tsx — tu fichero de entrada
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

// Tus propios overrides van DESPUÉS del import del SDK para ganar empates de specificity.
import "./styles/magicfeedback-overrides.css";
```

### Next.js (App Router)

Importa la hoja de estilos desde un componente `'use client'` o directamente desde tu root layout. En Pages Router se importa desde `_app.tsx`.

```tsx
// app/layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./globals.css"; // tus overrides

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

### Next.js (Pages Router)

```tsx
// pages/_app.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "../styles/magicfeedback-overrides.css";

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

### HTML plano — `node_modules` local

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="./assets/magicfeedback-overrides.css" />
```

### HTML plano — CDN

Si cargas el SDK desde un CDN (p. ej. unpkg o jsDelivr), carga la hoja de estilos correspondiente desde el mismo CDN.

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="/styles/magicfeedback-overrides.css" />
```

### React Native (dentro del HTML del WebView)

En React Native el SDK corre **dentro de un `WebView`** que carga una pequeña página HTML que tú alojas. Añade la hoja de estilos por defecto (y cualquier override) al `<head>` de esa página. Cargar desde CDN es lo más simple — no hay bundler dentro del WebView.

```html
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css"
    />
    <style>
      /* Overrides inline — mantén el WebView en un único fichero autocontenido */
      :root {
        --mf-primary: #0f766e;
        --mf-radius-md: 0.75rem;
      }
    </style>
  </head>
  <body>
    <div id="survey-root"></div>
    <script src="https://unpkg.com/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
    <!-- init + form.generate("survey-root", { ... }) aquí -->
  </body>
</html>
```

Mira [React Native](/es/reference/react-native/) para el cableado completo del WebView.

### El orden de carga importa

En cualquier integración, asegúrate de cargar la hoja de estilos del SDK **antes** que tus overrides — si no, tus reglas pueden perder empates de specificity contra las del SDK.

```ts
// ✅ orden correcto
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./my-overrides.css";

// ❌ mal — overrides cargados primero
import "./my-overrides.css";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### Cargar solo cuando se necesita

Para apps multi-página donde la encuesta aparece en pocas rutas, puedes diferir la hoja de estilos — pero asegúrate de que esté presente en el DOM **antes** de ejecutar `form.generate(...)`, o la primera pintura saldrá sin estilos.

```ts
async function showFeedback() {
  if (!document.getElementById("mf-styles")) {
    const link = document.createElement("link");
    link.id = "mf-styles";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css";
    document.head.appendChild(link);
    await new Promise((resolve) => (link.onload = resolve));
  }

  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  await form.generate("survey-root", { addButton: true });
}
```

---

## Capa 1 — Variables CSS (recomendado)

La forma más rápida de aplicar tu marca. Sobrescribe las variables que expone la hoja de estilos por defecto en cualquier sitio de tu propio CSS — después de importar los estilos del SDK.

```css
:root {
  --mf-primary: #0f766e;
  --mf-primary-hover: #115e59;
  --mf-primary-light: #ccfbf1;

  --mf-text-primary: #0f172a;
  --mf-text-secondary: #475569;

  --mf-bg-primary: #ffffff;
  --mf-bg-secondary: #f8fafc;

  --mf-border: #cbd5e1;
  --mf-border-focus: #0f766e;

  --mf-radius-md: 0.5rem;
  --mf-shadow-md: 0 10px 20px rgba(15, 23, 42, 0.08);
}
```

### Valores por defecto que trae el SDK

Estos son los valores exactos definidos en `magicfeedback-default.css`. Copia este bloque en tu propia hoja de estilos, cambia solo las variables que te interesen y tendrás una encuesta totalmente con tu marca.

```css
:root {
  /* Colores — pastel mínimo */
  --mf-primary: #1E293B;
  --mf-primary-hover: #0F172A;
  --mf-primary-light: #E2E8F0;

  --mf-text-primary: #1E293B;
  --mf-text-secondary: #475569;
  --mf-text-muted: #94A3B8;

  --mf-bg-primary: #F8FAFC;
  --mf-bg-secondary: #FFFFFF;
  --mf-bg-hover: #EEF2F6;

  --mf-border: #E2E8F0;
  --mf-border-focus: #1E293B;

  --mf-success: #16A34A;
  --mf-error:   #EF4444;
  --mf-warning: #F59E0B;

  --mf-surface:     #FFFFFF;
  --mf-surface-alt: #F1F5F9;
  --mf-accent:      #38BDF8;

  /* Espaciado */
  --mf-space-xs: 0.25rem;
  --mf-space-sm: 0.5rem;
  --mf-space-md: 0.75rem;
  --mf-space-lg: 1rem;
  --mf-space-xl: 1.5rem;

  /* Border radius */
  --mf-radius-sm:   0.5rem;
  --mf-radius-md:   0.75rem;
  --mf-radius-lg:   1.25rem;
  --mf-radius-full: 9999px;

  /* Sombras */
  --mf-shadow-sm:    0 1px 2px 0 rgba(15, 23, 42, 0.06);
  --mf-shadow-md:    0 8px 20px  rgba(15, 23, 42, 0.08);
  --mf-shadow-lg:    0 16px 30px rgba(15, 23, 42, 0.12);
  --mf-shadow-focus: 0 0 0 3px   rgba(30, 41, 59, 0.15);
  --mf-shadow-card:  0 18px 40px rgba(15, 23, 42, 0.08);

  /* Tipografía */
  --mf-font-sans: "Nunito", "Quicksand", "Avenir Next", "Trebuchet MS", sans-serif;
  --mf-font-size-sm:   0.875rem;
  --mf-font-size-base: 1rem;
  --mf-font-size-lg:   1.125rem;
  --mf-font-size-xl:   1.25rem;
  --mf-line-height:    1.6;

  --mf-font-weight-normal:     400;
  --mf-font-weight-medium:     500;
  --mf-font-weight-semibold:   600;
  --mf-font-weight-bold:       700;
  --mf-font-weight-extrabold:  800;

  /* Transiciones */
  --mf-transition:      all 0.2s ease;
  --mf-transition-fast: all 0.15s ease;
}
```

:::tip
La hoja de estilos por defecto importa la fuente **Nunito** de Google Fonts. Si quieres evitar la petición externa (offline, CSP, rendimiento), sobrescribe `--mf-font-sans` con tu propia pila de fuentes del sistema y aloja la tipografía tú mismo si lo necesitas.
:::

Replica tu modo oscuro con un segundo bloque:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --mf-bg-primary: #0f172a;
    --mf-bg-secondary: #111827;
    --mf-text-primary: #f8fafc;
    --mf-text-secondary: #94a3b8;
    --mf-border: #334155;
  }
}
```

Sin JavaScript de por medio. El siguiente render recogerá las variables nuevas.

---

## Capa 2 — Labels de botones integrados

Pasa los labels de los botones a `generate()`. Útil para localización o para ajustar el tono sin tocar CSS.

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Enviar feedback",
  backButtonText: "Atrás",
  nextButtonText: "Siguiente",
  startButtonText: "Empezar",
  addSuccessScreen: true,
  successMessage: "¡Gracias! Hemos recibido tu feedback.",
});
```

Si quieres **control total de la navegación** (tus propios botones en tu propio layout), desactiva las acciones integradas:

```ts
await form.generate("survey-root", { addButton: false });

document.getElementById("next")?.addEventListener("click", () => form.send());
document.getElementById("back")?.addEventListener("click", () => form.back());
```

### Controla toda la encuesta desde tus propios widgets

Si quieres ir más allá y renderizar también las **preguntas** con tus propios componentes — no solo los botones — pasa las respuestas programáticamente a `form.send()`. El SDK se salta el escaneo del DOM y la validación, y envía directamente.

```ts
// Renderiza tu UI como quieras. Cuando el usuario termine una página, manda
// las respuestas directamente al SDK. Disponible desde 2.2.4.
await form.send(
  [{ key: "source", value: ["custom-ui"] }], // metadata
  [],                                        // metrics
  [],                                        // profile
  [
    { key: "nps",              value: ["9"] },
    { key: "favorite-feature", value: ["Conditional logic"] },
  ],
);
```

Los hooks de ciclo de vida siguen disparándose, así que la analítica y cualquier cableado de UX siguen funcionando. Consulta [`form.send(metadata?, metrics?, profile?, answers?)`](/es/reference/api/#formsendmetadata-metrics-profile-answers) para el contrato completo.

---

## Capa 3 — Override de las clases generadas

Para retoques visuales más profundos que las variables, sobrescribe las clases directamente desde tu propio CSS. El SDK usa **nombres de clase estables** (todas con prefijo `magicfeedback-`), así que es seguro.

:::tip
Carga siempre la hoja de estilos del SDK **antes** que tus overrides para que tus reglas ganen los empates de specificity.
:::

### Referencia de clases

A continuación, el mapa completo de clases públicas que trae `magicfeedback-default.css`, agrupadas por lo que renderizan. Todas las clases llevan el prefijo `magicfeedback-`.

#### Layout

| Clase                          | Qué estila                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `.magicfeedback-container`     | Wrapper más externo del formulario renderizado.                                     |
| `.magicfeedback-form`          | El `<form>` que envuelve preguntas y acciones.                                      |
| `.magicfeedback-questions`     | Wrapper de la lista de preguntas de la página actual.                               |
| `.magicfeedback-div`           | Una pregunta individual — la unidad para spacing o bordes.                          |
| `.magicfeedback-label`         | Título principal de una pregunta.                                                   |
| `.magicfeedback-sublabel`      | Texto secundario / pista de una pregunta.                                           |
| `.magicfeedback-error`         | Mensaje de error de validación inline.                                              |
| `.magicfeedback-counter`       | Indicador de progreso (p. ej. "2 de 5").                                            |
| `.magicfeedback-image`         | Imagen renderizada dentro de una pregunta o página.                                 |
| `.magicfeedback-warning`       | Texto de aviso no bloqueante.                                                       |

#### Pantallas de inicio / éxito / info

| Clase                                 | Qué estila                                          |
| ------------------------------------- | --------------------------------------------------- |
| `.magicfeedback-start-message`        | Contenedor opcional de la pantalla de inicio.       |
| `.magicfeedback-start-message-button` | Botón CTA de la pantalla de inicio.                 |
| `.magicfeedback-info-message`         | Páginas de info standalone.                         |
| `.magicfeedback-success-message`      | Pantalla de "gracias" integrada.                    |

#### Barra de acciones

| Clase                              | Qué estila                                  |
| ---------------------------------- | ------------------------------------------- |
| `.magicfeedback-action-container`  | Barra que envuelve back / next / submit.    |
| `.magicfeedback-submit`            | Botón principal de submit / next.           |
| `.magicfeedback-back`              | Botón secundario "atrás".                   |
| `.magicfeedback-button`            | Botón genérico del SDK (usado en modales).  |
| `.magicfeedback-button-primary`    | Variante primary del botón genérico.        |
| `.magicfeedback-skip-container`    | Wrapper del checkbox de "skip".             |

#### Preguntas de elección (`RADIO`, `MULTIPLECHOICE`, `BOOLEAN`, `CONSENT`)

| Clase                                    | Qué estila                              |
| ---------------------------------------- | --------------------------------------- |
| `.magicfeedback-radio`                   | Contenedor de una pregunta `RADIO`.     |
| `.magicfeedback-radio-container`         | Cada opción radio (label + input).      |
| `.magicfeedback-checkbox`                | Contenedor de una pregunta `MULTIPLECHOICE`. |
| `.magicfeedback-checkbox-container`      | Cada opción checkbox.                   |
| `.magicfeedback-boolean-container`       | Contenedor de una pregunta `BOOLEAN`.   |
| `.magicfeedback-boolean-option`          | Cada opción yes/no.                     |
| `.magicfeedback-consent-container`       | Checkbox + label de `CONSENT`.          |

#### Preguntas de rating (`RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`)

| Clase                                                | Qué estila                                              |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `.magicfeedback-rating`                              | Wrapper genérico de rating.                             |
| `.magicfeedback-rating-container`                    | Fila de opciones de rating.                             |
| `.magicfeedback-rating-placeholder`                  | Texto auxiliar bajo un rating (p. ej. "Nada probable"). |
| `.magicfeedback-rating-placeholder-value`            | El valor numérico bajo un rating.                       |
| `.magicfeedback-rating-option-label-container`       | Una opción de rating emoji.                             |
| `.magicfeedback-rating-number`                       | Wrapper de una pregunta `RATING_NUMBER`.                |
| `.magicfeedback-rating-number-container`             | Fila de opciones numéricas.                             |
| `.magicfeedback-rating-number-option`                | Una opción numérica.                                    |
| `.magicfeedback-rating-number-option-label-container` | Par label/input dentro de una opción numérica.         |
| `.magicfeedback-rating-number-top-placeholder`       | Label superior de la escala numérica.                   |
| `.magicfeedback-rating-number-bottom-placeholder`    | Label inferior de la escala numérica.                   |
| `.magicfeedback-rating-star`                         | Wrapper de una pregunta `RATING_STAR`.                  |
| `.magicfeedback-rating-star-container`               | Fila de estrellas.                                      |
| `.magicfeedback-rating-star-option`                  | Una estrella.                                           |
| `.magicfeedback-rating-star-selected`                | Estado visual de la estrella seleccionada.              |
| `.rating__star`                                      | El glifo de la estrella en sí.                          |

#### Preguntas con elección por imagen (`MULTIPLECHOISE_IMAGE`)

| Clase                                              | Qué estila                              |
| -------------------------------------------------- | --------------------------------------- |
| `.magicfeedback-multiple-choice-image-option`      | Una opción de imagen.                   |
| `.magicfeedback-image-option-label-container`      | Grupo label/input/imagen.               |

#### Preguntas matriz (`MULTI_QUESTION_MATRIX`)

| Clase                                                  | Qué estila                      |
| ------------------------------------------------------ | ------------------------------- |
| `.magicfeedback-multi-question-matrix-container`       | Wrapper de la matriz.           |
| `.magicfeedback-multi-question-matrix-table`           | La `<table>` en sí.             |
| `.magicfeedback-multi-question-matrix-row-tr`          | Una fila.                       |
| `.magicfeedback-multi-question-matrix-row-label`       | Label izquierdo de la fila.     |

#### Lista de prioridades (`PRIORITY_LIST`)

| Clase                                       | Qué estila                              |
| ------------------------------------------- | --------------------------------------- |
| `.magicfeedback-priority-list-header`       | Cabecera de la lista.                   |
| `.magicfeedback-priority-list-list`         | La lista ordenada.                      |
| `.magicfeedback-priority-list-item`         | Un ítem reordenable.                    |
| `.magicfeedback-priority-list-item-label`   | Texto del label del ítem.               |
| `.magicfeedback-priority-list-arrows`       | Grupo de flechas arriba/abajo.          |
| `.magicfeedback-priority-list-arrow-up`     | Flecha arriba.                          |
| `.magicfeedback-priority-list-arrow-down`   | Flecha abajo.                           |
| `.magicfeedback-priority-list-reorder`     | Área de reordenación.                   |

#### Sistema de puntos (`POINT_SYSTEM`)

| Clase                                            | Qué estila                                      |
| ------------------------------------------------ | ----------------------------------------------- |
| `.magicfeedback-point-system-item`               | Una fila de asignación de puntos.               |
| `.magicfeedback-point-system-input-container`    | Wrapper del input de puntos.                    |
| `.magicfeedback-point-system-total`              | Indicador de "puntos usados / total".           |

#### Modal (usado por algunos widgets compuestos)

| Clase                                | Qué estila                                  |
| ------------------------------------ | ------------------------------------------- |
| `.magicfeedback-modal-backdrop`      | Fondo oscurecido detrás del modal.          |
| `.magicfeedback-modal`               | El panel del modal.                         |
| `.magicfeedback-modal-actions`       | Zona de acciones dentro del modal.          |
| `.magicfeedback-modal-counter`       | Contador de progreso dentro del modal.      |
| `.magicfeedback-modal-list`          | Lista renderizada dentro del modal.         |
| `.magicfeedback-modal-row`           | Una fila dentro de la lista del modal.      |
| `.magicfeedback-modal-close`         | Botón de cierre del modal.                  |

#### Accesibilidad

| Clase                              | Qué estila                                    |
| ---------------------------------- | --------------------------------------------- |
| `.magicfeedback-visually-hidden`   | Texto solo para lectores de pantalla.         |

### Ejemplos de overrides

```css
/* Compactar el spacing de preguntas en modales slim */
.magicfeedback-div {
  margin-bottom: 1rem;
}

/* Títulos de pregunta más rotundos */
.magicfeedback-label {
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* Botón submit en forma de píldora */
.magicfeedback-submit {
  border-radius: 9999px;
  padding-inline: 1.5rem;
}

/* Ratings emoji cuadrados con un hover lift sutil */
.magicfeedback-rating-option-label-container img {
  border-radius: 12px;
  transition: transform 0.15s ease;
}
.magicfeedback-rating-option-label-container img:hover {
  transform: translateY(-2px) scale(1.05);
}

/* Cambiar el zebra de la matriz por solo bordes */
.magicfeedback-multi-question-matrix-row-tr:nth-child(even) {
  background: transparent;
}
.magicfeedback-multi-question-matrix-table td,
.magicfeedback-multi-question-matrix-table th {
  border-bottom: 1px solid var(--mf-border);
}
```

:::tip
Para una personalización más profunda, la hoja de estilos completa está en `node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css`. Ábrela una vez para ver el conjunto completo de selectores y sobrescribe solo lo que necesites.
:::

---

## Formato de pregunta: standard vs. slim

`questionFormat` cambia entre las dos densidades visuales integradas.

```ts
await form.generate("survey-root", {
  questionFormat: "slim", // o "standard" (por defecto)
});
```

- `"standard"` — espaciado generoso, inputs grandes. Va bien para encuestas a página completa.
- `"slim"` — compacto, encaja dentro de modales, drawers o sidebars.

---

## Localizar la pantalla de éxito

`addSuccessScreen` activa la vista de "gracias" integrada. Combínalo con `successMessage` para localizar, o desactívalo y renderiza la tuya:

```ts
await form.generate("survey-root", {
  addSuccessScreen: false,
  afterSubmitEvent: ({ completed }) => {
    if (completed) {
      renderMyOwnThankYouView();
    }
  },
});
```

Mira [Eventos de ciclo de vida](/es/guides/events/) para la superficie completa de callbacks.

---

## Lo que no puedes cambiar desde el SDK

- El **orden y contenido de las preguntas** — viven en el dashboard de MagicFeedback.
- Los **endpoints de la API** — seleccionados por `init({ env })` entre `prod` y `dev`.
- La lista de **tipos de pregunta soportados** — mira [Referencia de la API → Tipos de pregunta soportados](/es/reference/api/#supported-question-types).

Si necesitas un tipo de pregunta, layout o comportamiento que el SDK no expone, habla con tu contacto de MagicFeedback en lugar de parchear el SDK en user-land.
