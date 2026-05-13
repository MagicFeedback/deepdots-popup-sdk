---
title: React
description: Sådan bruger du MagicFeedback SDK'et i en React (web) applikation.
---

## Kompatibilitet

SDK'et er et browserbibliotek. Det afhænger af `window`, `document`, `navigator` og `localStorage`, og renderer direkte ind i DOM-elementet med det id, du angiver. Det fungerer i enhver React-app, der kører i browseren (Vite, CRA, Next.js, Remix m.fl.).

I SSR-frameworks (Next.js App Router, Remix) skal SDK'et kun instantieres på klienten — inde i `useEffect` eller fra en `'use client'`-komponent.

## Installation

```bash
npm install @magicfeedback/native
```

Importér stylesheettet én gang i din apps entry:

```ts
// fx main.tsx, _app.tsx, layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

## Basis-komponent

Minimal mønster: en container `<div>` med et stabilt id og en `useEffect`, der kalder `init` og `generate` én gang.

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

## Genbrugelig hook

Skal du mounte undersøgelsen flere steder, så pak opsætningen ind i en hook:

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

## Render i en modal

SDK'et tegner ikke modalen — det gør dit designsystem. Mount undersøgelsen først, når modalen åbnes.

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

Se [Rendering surfaces](/da/guides/rendering-surfaces/) for flere mønstre (drawer, bottom sheet, dedikeret side).

## Livscyklus-events

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

Se [Livscyklus-events](/da/guides/events/) for hele overfladen.

## Almindelige faldgruber

:::caution
Instantiér ikke SDK'et på modulniveau. `window` er undefined under SSR. Kør altid `init` og `generate` inde i `useEffect` eller en `'use client'`-komponent.
:::

:::caution
Send en **id-string** til `form.generate(...)`, ikke en CSS-selektor eller en React-ref. `"survey-root"`, ikke `"#survey-root"` og ikke `ref.current`.
:::

:::caution
React StrictMode kører effects to gange i udvikling. Hvis du kalder `generate()` igen på samme container, erstatter SDK'et indholdet — den synlige adfærd er fin, men du ser ekstra netværkskald. Brug en `useRef`-vagt hvis det generer dig.
:::

:::caution
Mount containeren i samme render som `generate()`. Hvis containeren ikke findes når `generate()` kører (fx i et inaktivt tab), har formularen intet sted at rendere.
:::
