---
title: React
description: Cómo usar el MagicFeedback SDK dentro de una aplicación React (web).
---

## Compatibilidad

El SDK es una librería de navegador. Depende de `window`, `document`, `navigator` y `localStorage`, y renderiza directamente dentro del elemento del DOM cuyo id le pases. Funciona en cualquier app React que corra en el navegador (Vite, CRA, Next.js, Remix, etc.).

Para frameworks con SSR (Next.js App Router, Remix), instancia el SDK solo en el cliente — dentro de `useEffect` o desde un componente `'use client'`.

## Instalación

```bash
npm install @magicfeedback/native
```

Importa la hoja de estilos una vez, en el punto de entrada de tu app:

```ts
// p. ej. main.tsx, _app.tsx, layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

## Componente básico

El patrón mínimo: un contenedor `<div>` con un id estable y un `useEffect` que llama a `init` y `generate` una sola vez.

```tsx
import { useEffect } from "react";
import magicfeedback from "@magicfeedback/native";

export function FeedbackSurvey() {
  useEffect(() => {
    magicfeedback.init({ env: "prod" });

    const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
    form.generate("survey-root", {
      addButton: true,
      addSuccessScreen: true,
    });
  }, []);

  return <div id="survey-root" />;
}
```

## Hook reutilizable

Si montas la encuesta en más de un sitio, envuelve la configuración en un hook:

```ts
// useMagicFeedbackForm.ts
import { useEffect } from "react";
import magicfeedback from "@magicfeedback/native";
import type { generateFormOptions } from "@magicfeedback/native/dist/types/src/models/types";

export function useMagicFeedbackForm(
  containerId: string,
  appId: string,
  publicKey: string,
  options?: generateFormOptions,
) {
  useEffect(() => {
    magicfeedback.init({ env: "prod" });
    const form = magicfeedback.form(appId, publicKey);
    form.generate(containerId, options);
  }, [containerId, appId, publicKey]);
}
```

```tsx
function FeedbackPage() {
  useMagicFeedbackForm("survey-root", "APP_ID", "PUBLIC_KEY", {
    addButton: true,
    questionFormat: "slim",
  });

  return <div id="survey-root" />;
}
```

## Next.js (App Router)

```tsx
// app/components/FeedbackSurvey.tsx
"use client";

import { useEffect } from "react";
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

export function FeedbackSurvey() {
  useEffect(() => {
    magicfeedback.init({ env: "prod" });
    const form = magicfeedback.form(
      process.env.NEXT_PUBLIC_MF_APP_ID!,
      process.env.NEXT_PUBLIC_MF_PUBLIC_KEY!,
    );
    form.generate("survey-root", { addButton: true });
  }, []);

  return <div id="survey-root" />;
}
```

## Renderizar en un modal

El SDK no dibuja el modal — lo hace tu design system. Monta la encuesta solo cuando el modal se abre.

```tsx
import { useEffect } from "react";
import magicfeedback from "@magicfeedback/native";

export function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
    form.generate("survey-root", {
      addButton: true,
      addSuccessScreen: true,
      questionFormat: "slim",
      afterSubmitEvent: ({ completed }) => {
        if (completed) onClose();
      },
    });
  }, [open]);

  if (!open) return null;

  return (
    <Dialog onClose={onClose}>
      <div id="survey-root" />
    </Dialog>
  );
}
```

Mira [Rendering surfaces](/es/guides/rendering-surfaces/) para más patrones (drawer, bottom sheet, página dedicada).

## Eventos de ciclo de vida

```tsx
useEffect(() => {
  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root", {
    onLoadedEvent: () => analytics.track("survey_loaded"),
    afterSubmitEvent: ({ completed }) => {
      if (completed) analytics.track("survey_completed");
    },
  });
}, []);
```

Mira [Eventos de ciclo de vida](/es/guides/events/) para la superficie completa.

## Errores comunes

:::caution
No instancies el SDK en el ámbito del módulo. `window` no existe durante SSR. Llama siempre a `init` y `generate` dentro de `useEffect` o un componente `'use client'`.
:::

:::caution
Pasa un **id string** a `form.generate(...)`, no un selector CSS ni una ref. `"survey-root"`, no `"#survey-root"` ni `ref.current`.
:::

:::caution
React StrictMode monta los efectos dos veces en desarrollo. Si vuelves a llamar a `generate()` sobre el mismo contenedor, el SDK reemplaza su contenido — visualmente está bien, pero verás llamadas de red extra. Usa una guarda con `useRef` si te molesta.
:::

:::caution
Monta el contenedor en el mismo render donde llamas a `generate()`. Si el contenedor no existe cuando se ejecuta `generate()` (p. ej. dentro de una pestaña inactiva), el formulario no tiene dónde renderizar.
:::
