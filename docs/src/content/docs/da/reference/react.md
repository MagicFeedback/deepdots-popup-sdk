---
title: React
description: Sådan bruger du Deepdots Popup SDK i en React (web) applikation.
---

## Kompatibilitet

SDK'et er et browserbibliotek: det afhænger af `window` og `document` og monterer sin egen container på `document.body`. Det fungerer uden yderligere opsætning i enhver React-app, der kører i browseren (Vite, CRA, Next.js, Remix osv.).

I frameworks med SSR (Next.js App Router, Remix) skal du sørge for, at SDK'et kun instantieres på klienten — typisk inde i `useEffect` eller en `'use client'`-komponent.

## Installation

```bash
npm install @magicfeedback/popup-sdk
```

## Grundlæggende integration

SDK'et har intern tilstand og bør oprettes én gang pr. applikation. Den reneste tilgang er at pakke det ind i en custom hook og kalde den fra din rod-layout eller en provider på øverste niveau.

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

I App Routeren skal du montere SDK'et inde i en klientkomponent og importere den fra dit rod-layout.

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
    <html lang="da">
      <body>
        {children}
        <DeepdotsProvider userId="customer-123" />
      </body>
    </html>
  );
}
```

## Udløs en popup fra en React-komponent

Du kan også gemme en reference til instansen og kalde `show()` eller `triggerEvent()` fra en event handler.

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
      Giv feedback
    </button>
  );
}
```

## Lyt til events

Abonnér inde i `useEffect`, og afmeld i cleanup for at undgå lækager mellem re-mounts (f.eks. med React StrictMode i udvikling).

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

## Almindelige faldgruber

:::caution
Instantiér ikke `DeepdotsPopups` på modulniveau eller inde i render-kroppen — det vil køre under SSR og fejle, fordi `window` ikke findes. Læg det altid inde i `useEffect` eller en `'use client'`-komponent.
:::

:::caution
Med React StrictMode kører `useEffect` to gange i udvikling. Brug en `useRef` som vagt (som vist ovenfor) for at undgå dobbeltinitialisering.
:::

:::caution
SDK'et indsætter en container i `document.body`. Forsøg ikke at rendere den inde i React-træet — lad SDK'et håndtere sin egen DOM.
:::
