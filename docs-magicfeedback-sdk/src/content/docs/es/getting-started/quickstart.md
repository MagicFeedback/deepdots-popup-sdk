---
title: Quickstart
description: Renderiza tu primer formulario de MagicFeedback en tres pasos.
---

Necesitas dos valores de MagicFeedback:

- `APP_ID` — tu id de integración
- `PUBLIC_KEY` — tu clave pública

## 1. Instalación

Mira [Instalación](/es/getting-started/installation/) para los pasos completos.

```bash
npm install @magicfeedback/native
```

## 2. Monta un contenedor

Pon un `<div>` vacío con un **id** donde quieras que aparezca la encuesta. El SDK renderizará dentro de ese contenedor.

```html
<div id="survey-root"></div>
```

El contenedor puede estar en cualquier sitio — una página completa, un modal, un drawer, una pestaña, un bottom sheet. Mira [Rendering surfaces](/es/guides/rendering-surfaces/) para más patrones.

## 3. Inicializa y renderiza

### Bundler (Vite / Webpack / SPA)

```ts
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

magicfeedback.init({ env: "prod" });

const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");

await form.generate("survey-root", {
  addButton: true,
  addSuccessScreen: true,
});
```

### HTML plano

```html
<link rel="stylesheet" href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css" />
<div id="survey-root"></div>
<script src="./node_modules/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
<script>
  window.magicfeedback.init({ env: "prod" });
  const form = window.magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root", { addButton: true, addSuccessScreen: true });
</script>
```

:::caution
`form.generate()` recibe un **id string del DOM** (p. ej. `"survey-root"`) — no un selector CSS como `"#survey-root"`.
:::

## Pruébalo antes de producción

Usa el entorno `dev` junto con `dryRun` para hacer QA de la encuesta sin crear registros reales.

```ts
magicfeedback.init({
  env: "dev",
  debug: true,
  dryRun: true,
});
```

`dryRun: true` carga y navega el formulario con normalidad, pero **omite el envío final** a la API.

## Reanudar una sesión existente

Si ya tienes un session id (p. ej. desde un enlace por email), renderízalo directamente:

```ts
const form = magicfeedback.session("SESSION_ID");
await form.generate("survey-root", { addButton: true });
```

## Siguientes pasos

- [Personaliza la UI](/es/guides/customization/) (variables CSS, labels de botones, temas).
- [Renderiza en cualquier superficie](/es/guides/rendering-surfaces/) (modal, drawer, página, bottom sheet).
- [Engancha los eventos de ciclo de vida](/es/guides/events/).
- [Referencia de la API](/es/reference/api/).
