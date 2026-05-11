---
title: React
description: Cómo usar el SDK de popups de Deepdots dentro de una aplicación React (web).
---

## Compatibilidad

El SDK es una librería de navegador: depende de `window` y `document`, y monta su propio contenedor en `document.body`. Funciona sin configuración adicional en cualquier app React que se ejecute en el navegador (Vite, CRA, Next.js, Remix, etc.).

En frameworks con SSR (Next.js App Router, Remix), asegúrate de instanciar el SDK únicamente en el cliente — normalmente dentro de un `useEffect` o de un componente con `'use client'`.

## Instalación

```bash
npm install @magicfeedback/popup-sdk
```

## Integración básica

El SDK guarda estado interno y debe crearse una sola vez por aplicación. La forma más limpia es envolverlo en un hook y llamarlo desde el layout raíz o un provider de alto nivel.

```tsx
// hooks/useDeepdotsPopups.ts
import { useEffect, useRef } from 'react';
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

export function useDeepdotsPopups(userId?: string) {
  const ref = useRef<DeepdotsPopups | null>(null);

  useEffect(() => {
    if (ref.current) return;

    const popups = new DeepdotsPopups();
    popups.init({
      mode: 'server',
      apiKey: 'YOUR_PUBLIC_API_KEY',
      userId,
    });

    popups.autoLaunch();
    ref.current = popups;
  }, [userId]);

  return ref;
}
```

```tsx
// App.tsx
import { useDeepdotsPopups } from './hooks/useDeepdotsPopups';

export default function App() {
  useDeepdotsPopups('customer-123');

  return <YourRoutes />;
}
```

## Next.js (App Router)

En el App Router, monta el SDK dentro de un componente cliente e impórtalo desde el layout raíz.

```tsx
// app/components/DeepdotsProvider.tsx
'use client';

import { useEffect } from 'react';
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

export function DeepdotsProvider({ userId }: { userId?: string }) {
  useEffect(() => {
    const popups = new DeepdotsPopups();
    popups.init({
      mode: 'server',
      apiKey: process.env.NEXT_PUBLIC_DEEPDOTS_API_KEY!,
      userId,
    });
    popups.autoLaunch();
  }, [userId]);

  return null;
}
```

```tsx
// app/layout.tsx
import { DeepdotsProvider } from './components/DeepdotsProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <DeepdotsProvider userId="customer-123" />
      </body>
    </html>
  );
}
```

## Disparar un popup desde un componente React

También puedes guardar una referencia a la instancia y llamar a `show()` o `triggerEvent()` desde un handler.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

export function FeedbackButton() {
  const popupsRef = useRef<DeepdotsPopups | null>(null);

  useEffect(() => {
    const popups = new DeepdotsPopups();
    popups.init({
      mode: 'server',
      apiKey: 'YOUR_PUBLIC_API_KEY',
    });
    popups.autoLaunch();
    popupsRef.current = popups;
  }, []);

  return (
    <button
      onClick={() =>
        popupsRef.current?.show({
          surveyId: 'survey-home-001',
          productId: 'product-main',
        })
      }
    >
      Enviar feedback
    </button>
  );
}
```

## Escuchar eventos

Suscríbete dentro de `useEffect` y cancela la suscripción en el cleanup para evitar fugas entre re-montajes (por ejemplo, con React StrictMode en desarrollo).

```tsx
useEffect(() => {
  const popups = new DeepdotsPopups();
  popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });

  const onShown = (event: unknown) => console.log('shown', event);
  const onCompleted = (event: unknown) => console.log('completed', event);

  popups.on('popup_shown', onShown);
  popups.on('survey_completed', onCompleted);
  popups.autoLaunch();

  return () => {
    popups.off('popup_shown', onShown);
    popups.off('survey_completed', onCompleted);
  };
}, []);
```

## Errores comunes

:::caution
No instancies `DeepdotsPopups` en el ámbito del módulo ni dentro del cuerpo del render — se ejecutaría durante el SSR y fallaría porque `window` no existe. Hazlo siempre dentro de `useEffect` o de un componente `'use client'`.
:::

:::caution
Con React StrictMode, el `useEffect` se ejecuta dos veces en desarrollo. Usa una `useRef` como guarda (como se muestra arriba) para evitar la doble inicialización.
:::

:::caution
El SDK inyecta un contenedor en `document.body`. No intentes renderizarlo dentro del árbol de React — deja que el SDK gestione su propio DOM.
:::
