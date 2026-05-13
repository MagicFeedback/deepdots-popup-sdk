---
title: Instalación
description: Añade @magicfeedback/native a tu proyecto.
---

El MagicFeedback SDK se publica en npm como `@magicfeedback/native`.

## Instalación

```bash
npm install @magicfeedback/native
```

O con yarn / pnpm:

```bash
yarn add @magicfeedback/native
pnpm add @magicfeedback/native
```

## Importa la hoja de estilos

El SDK incluye una hoja de estilos por defecto. Impórtala una vez en el punto de entrada de tu app, o cárgala desde tu CDN en HTML plano.

### Bundler (Vite, Webpack, Next.js, etc.)

```ts
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### HTML plano

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
```

La hoja de estilos es necesaria para que la encuesta se renderice correctamente. Puedes sobrescribir su apariencia por completo con [variables CSS](/es/guides/customization/).

## Requisitos de navegador

Este SDK es **solo para navegador**. Depende de `window`, `document`, `navigator` y `localStorage`. No lo llames durante SSR — envuélvelo en un componente client-only o ejecútalo dentro de `useEffect` (React) u `onMount` (Svelte/Vue).

Para React Native, mira la [referencia de React Native](/es/reference/react-native/).

## Verificar la instalación

```ts
import magicfeedback from "@magicfeedback/native";

magicfeedback.init({ env: "dev", debug: true });
console.log("MagicFeedback SDK initialized");
```

Si ves la línea de log sin errores, estás listo para renderizar un formulario — pasa al [Quickstart](/es/getting-started/quickstart/).
