---
title: React
description: How to use the Deepdots Popup SDK inside a React (web) application.
---

## Compatibility

The SDK is a browser library: it relies on `window` and `document` and mounts its own DOM container on `document.body`. It works out of the box in any React app that runs in the browser (Vite, CRA, Next.js, Remix, etc.).

For frameworks with SSR (Next.js App Router, Remix), make sure the SDK is only instantiated on the client — typically inside `useEffect` or a `'use client'` component.

## Installation

```bash
npm install @magicfeedback/popup-sdk
```

## Basic integration

The SDK is stateful and should be created once per app. The cleanest approach is to wrap it in a custom hook and call it from your root layout or a top-level provider.

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

In the App Router, mount the SDK inside a client component and import it from your root layout.

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
    <html lang="en">
      <body>
        {children}
        <DeepdotsProvider userId="customer-123" />
      </body>
    </html>
  );
}
```

## Triggering a popup from a React component

You can also keep a reference to the instance and call `show()` or `triggerEvent()` from event handlers.

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
      Give feedback
    </button>
  );
}
```

## Listening to events

Subscribe inside `useEffect` and unsubscribe on cleanup to avoid leaks across re-mounts (e.g. React StrictMode in development).

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

## Common pitfalls

:::caution
Do not instantiate `DeepdotsPopups` at module scope or inside the render body — it will run during SSR and throw because `window` is undefined. Always put it inside `useEffect` or a `'use client'` component.
:::

:::caution
With React StrictMode the `useEffect` runs twice in development. Use a `useRef` guard (as shown above) to avoid double-initialization.
:::

:::caution
The SDK injects a container into `document.body`. Don't try to render it inside a React tree — let the SDK manage its own DOM.
:::
