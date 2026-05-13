---
title: React
description: How to use the MagicFeedback SDK inside a React (web) application.
---

## Compatibility

The SDK is a browser library. It relies on `window`, `document`, `navigator`, and `localStorage`, and renders directly into a DOM element with the id you provide. It works in any React app that runs in the browser (Vite, CRA, Next.js, Remix, etc.).

For SSR frameworks (Next.js App Router, Remix), instantiate the SDK only on the client — inside `useEffect`, or from a `'use client'` component.

## Installation

```bash
npm install @magicfeedback/native
```

Import the stylesheet once, at the entry point of your app:

```ts
// e.g. main.tsx, _app.tsx, layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

## Basic component

The minimal pattern: a container `<div>` with a stable id, and a `useEffect` that calls `init` and `generate` once.

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

## Reusable hook

If you mount the survey in more than one place, wrap the setup in a hook:

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

## Rendering in a modal

The SDK doesn't draw the modal — your design system does. Mount the survey only when the modal opens.

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

See [Rendering surfaces](/guides/rendering-surfaces/) for more patterns (drawer, bottom sheet, dedicated page).

## Lifecycle events

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

See [Lifecycle events](/guides/events/) for the full surface.

## Common pitfalls

:::caution
Do not instantiate the SDK at module scope. `window` is undefined during SSR. Always run `init` and `generate` inside `useEffect` or a `'use client'` component.
:::

:::caution
Pass an **id string** to `form.generate(...)`, not a CSS selector or a React ref. `"survey-root"`, not `"#survey-root"` and not `ref.current`.
:::

:::caution
React StrictMode mounts effects twice in development. If you re-call `generate()` on the same container, the SDK replaces its contents — the visible behavior is fine, but you'll see extra network calls. Use a `useRef` guard if that bothers you.
:::

:::caution
Mount the container in the same render where you call `generate()`. If the container does not exist when `generate()` runs (e.g. inside an inactive tab), the form has nowhere to render.
:::
